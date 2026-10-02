const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, therapySchema, optId, isoDate, emptyToUndefined, addMinutes, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission, assertOwnsStaffRecord } = require('../auth');
const { withTransaction } = require('../db');
const { assertSlotFree } = require('../scheduling');

// Treatment notes are health information. They are readable and writable only by
// managers and by the therapist who runs the appointment. Everyone else gets
// TreatmentNotes: null plus NotesHidden: true, and search never looks inside notes
// (otherwise a search could reveal what they contain).
const SELECT = `pt.*, s.FirstName AS StaffFirstName, s.LastName AS StaffLastName,
                m.FirstName AS MemberFirstName, m.LastName AS MemberLastName`;
const FROM = `FROM physicaltherapysession pt
  LEFT JOIN staff s  ON s.StaffID  = pt.StaffID
  LEFT JOIN member m ON m.MemberID = pt.MemberID`;

const COLUMNS = ['StaffID', 'MemberID', 'AppointmentDate', 'DurationMinutes', 'ReferralSource'];
const optDate = z.preprocess(emptyToUndefined, isoDate.optional());
const WHAT = 'therapy appointments';

const canSeeNotes = (user, staffId) =>
  user.Role === 'manager' || (user.Role === 'therapist' && user.StaffID === staffId);

function redact(row, user) {
  if (canSeeNotes(user, row.StaffID)) return { ...row, NotesHidden: false };
  return { ...row, TreatmentNotes: null, NotesHidden: true };
}

module.exports = function therapyRoutes({ db }) {
  const router = express.Router();

  const getRaw = async (id, conn = db) => {
    const [found] = await conn.query(`SELECT ${SELECT} ${FROM} WHERE pt.TherapyID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Therapy appointment not found');
    return found[0];
  };

  const slotOf = (d, id) => ({
    start: d.AppointmentDate,
    end: addMinutes(d.AppointmentDate, d.DurationMinutes),
    staffId: d.StaffID,
    memberId: d.MemberID,
    ignore: { therapy: id },
  });

  const assertMayWriteNotes = (user, staffId, notes) => {
    if (notes !== null && !canSeeNotes(user, staffId)) {
      throw new HttpError(403, 'Only managers and the treating therapist can write treatment notes');
    }
  };

  router.get(
    '/',
    requirePermission('therapy:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, {
        staffId: optId,
        memberId: optId,
        from: optDate,
        to: optDate,
        mine: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
      });
      const where = new Where()
        .search(
          ["CONCAT(m.FirstName, ' ', m.LastName)", "CONCAT(s.FirstName, ' ', s.LastName)", 'pt.ReferralSource'],
          p.q
        )
        .addIf(p.staffId, 'pt.StaffID = ?')
        .addIf(p.memberId, 'pt.MemberID = ?')
        .addIf(p.from, 'pt.AppointmentDate >= ?')
        // "to" is a whole day, so compare against the start of the next day.
        .addIf(p.to, 'pt.AppointmentDate < DATE_ADD(?, INTERVAL 1 DAY)');
      if (p.mine === 'true') where.add('pt.StaffID = ?', req.user.StaffID ?? 0);

      const page = await paginate(db, p, {
        select: SELECT,
        from: FROM,
        where,
        sortable: {
          id: 'pt.TherapyID',
          date: 'pt.AppointmentDate',
          member: ['m.LastName', 'm.FirstName'],
          therapist: ['s.LastName', 's.FirstName'],
        },
        defaultSort: { key: 'date', order: 'desc' },
        idColumn: 'pt.TherapyID',
      });
      page.data = page.data.map((row) => redact(row, req.user));
      res.json(page);
    })
  );

  router.get(
    '/:id',
    requirePermission('therapy:read'),
    wrap(async (req, res) => {
      res.json(redact(await getRaw(parseId(req.params.id)), req.user));
    })
  );

  router.post(
    '/',
    requirePermission('therapy:write'),
    wrap(async (req, res) => {
      const d = validate(therapySchema, req.body);
      assertOwnsStaffRecord(req.user, d.StaffID, WHAT);
      assertMayWriteNotes(req.user, d.StaffID, d.TreatmentNotes);
      const created = await withTransaction(db, async (conn) => {
        await assertSlotFree(conn, slotOf(d));
        const cols = [...COLUMNS, 'TreatmentNotes'];
        const [result] = await conn.query(
          `INSERT INTO physicaltherapysession (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => d[c])
        );
        return getRaw(result.insertId, conn);
      });
      res.status(201).json(redact(created, req.user));
    })
  );

  router.put(
    '/:id',
    requirePermission('therapy:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(therapySchema, req.body);
      const updated = await withTransaction(db, async (conn) => {
        const [existing] = await conn.query(
          'SELECT StaffID FROM physicaltherapysession WHERE TherapyID = ? FOR UPDATE',
          [id]
        );
        if (!existing.length) throw new HttpError(404, 'Therapy appointment not found');
        assertOwnsStaffRecord(req.user, existing[0].StaffID, WHAT);
        assertOwnsStaffRecord(req.user, d.StaffID, WHAT);
        assertMayWriteNotes(req.user, existing[0].StaffID, d.TreatmentNotes);
        await assertSlotFree(conn, slotOf(d, id));

        // Users who can't see the notes can still reschedule; the notes are left untouched.
        const cols = canSeeNotes(req.user, existing[0].StaffID) ? [...COLUMNS, 'TreatmentNotes'] : COLUMNS;
        await conn.query(
          `UPDATE physicaltherapysession SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE TherapyID = ?`,
          [...cols.map((c) => d[c]), id]
        );
        return getRaw(id, conn);
      });
      res.json(redact(updated, req.user));
    })
  );

  router.delete(
    '/:id',
    requirePermission('therapy:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const existing = await getRaw(id);
      assertOwnsStaffRecord(req.user, existing.StaffID, WHAT);
      await db.query('DELETE FROM physicaltherapysession WHERE TherapyID = ?', [id]);
      res.status(204).end();
    })
  );

  return router;
};
