const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, trainingSchema, optId, isoDate, emptyToUndefined, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission, assertOwnsStaffRecord } = require('../auth');
const { withTransaction } = require('../db');
const { assertSlotFree } = require('../scheduling');

// ReservationID is intentionally not exposed for writing (see README: it links a
// personal session to a *class* reservation, which is an open modelling question).
const SELECT = `t.*, s.FirstName AS StaffFirstName, s.LastName AS StaffLastName,
                m.FirstName AS MemberFirstName, m.LastName AS MemberLastName`;
const FROM = `FROM personaltrainingsession t
  LEFT JOIN staff s  ON s.StaffID  = t.StaffID
  LEFT JOIN member m ON m.MemberID = t.MemberID`;

const COLUMNS = ['StaffID', 'MemberID', 'StartDate', 'StartTime', 'EndDate', 'EndTime', 'SessionNotes'];
const optDate = z.preprocess(emptyToUndefined, isoDate.optional());
const WHAT = 'training sessions';

module.exports = function trainingRoutes({ db }) {
  const router = express.Router();

  const getSession = async (id, conn = db) => {
    const [found] = await conn.query(`SELECT ${SELECT} ${FROM} WHERE t.TrainingID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Training session not found');
    return found[0];
  };

  const slotOf = (d, id) => ({
    start: `${d.StartDate} ${d.StartTime}`,
    end: `${d.EndDate} ${d.EndTime}`,
    staffId: d.StaffID,
    memberId: d.MemberID,
    ignore: { training: id },
  });

  router.get(
    '/',
    requirePermission('training:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, {
        staffId: optId,
        memberId: optId,
        from: optDate,
        to: optDate,
        mine: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
      });
      const where = new Where()
        .search(["CONCAT(m.FirstName, ' ', m.LastName)", "CONCAT(s.FirstName, ' ', s.LastName)", 't.SessionNotes'], p.q)
        .addIf(p.staffId, 't.StaffID = ?')
        .addIf(p.memberId, 't.MemberID = ?')
        .addIf(p.from, 't.StartDate >= ?')
        .addIf(p.to, 't.StartDate <= ?');
      if (p.mine === 'true') where.add('t.StaffID = ?', req.user.StaffID ?? 0);

      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: {
            id: 't.TrainingID',
            start: ['t.StartDate', 't.StartTime'],
            member: ['m.LastName', 'm.FirstName'],
            trainer: ['s.LastName', 's.FirstName'],
          },
          defaultSort: { key: 'start', order: 'desc' },
          idColumn: 't.TrainingID',
        })
      );
    })
  );

  router.get(
    '/:id',
    requirePermission('training:read'),
    wrap(async (req, res) => {
      res.json(await getSession(parseId(req.params.id)));
    })
  );

  router.post(
    '/',
    requirePermission('training:write'),
    wrap(async (req, res) => {
      const d = validate(trainingSchema, req.body);
      assertOwnsStaffRecord(req.user, d.StaffID, WHAT);
      const created = await withTransaction(db, async (conn) => {
        await assertSlotFree(conn, slotOf(d));
        const [result] = await conn.query(
          `INSERT INTO personaltrainingsession (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
          COLUMNS.map((c) => d[c])
        );
        return getSession(result.insertId, conn);
      });
      res.status(201).json(created);
    })
  );

  router.put(
    '/:id',
    requirePermission('training:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(trainingSchema, req.body);
      const updated = await withTransaction(db, async (conn) => {
        const [existing] = await conn.query(
          'SELECT StaffID FROM personaltrainingsession WHERE TrainingID = ? FOR UPDATE',
          [id]
        );
        if (!existing.length) throw new HttpError(404, 'Training session not found');
        assertOwnsStaffRecord(req.user, existing[0].StaffID, WHAT);
        assertOwnsStaffRecord(req.user, d.StaffID, WHAT); // and can't hand it to someone else
        await assertSlotFree(conn, slotOf(d, id));
        await conn.query(
          `UPDATE personaltrainingsession SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE TrainingID = ?`,
          [...COLUMNS.map((c) => d[c]), id]
        );
        return getSession(id, conn);
      });
      res.json(updated);
    })
  );

  router.delete(
    '/:id',
    requirePermission('training:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const existing = await getSession(id);
      assertOwnsStaffRecord(req.user, existing.StaffID, WHAT);
      await db.query('DELETE FROM personaltrainingsession WHERE TrainingID = ?', [id]);
      res.status(204).end();
    })
  );

  return router;
};
