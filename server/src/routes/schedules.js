const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, scheduleSchema, optId, isoDate, emptyToUndefined, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');
const { withTransaction } = require('../db');
const { assertSlotFree } = require('../scheduling');

// Seats taken = Booked + Attended reservations (cancelled ones free the seat).
const SELECT = `cs.*, g.ClassName, g.DifficultyLevel,
                s.FirstName AS StaffFirstName, s.LastName AS StaffLastName,
                r.RoomNumber, r.Capacity AS RoomCapacity,
                (SELECT COUNT(*) FROM reservation rv
                  WHERE rv.ScheduleID = cs.ScheduleID AND rv.ReservationStatus IN ('Booked','Attended')) AS Booked`;
const FROM = `FROM classschedule cs
  LEFT JOIN groupfitnessclass g ON g.ClassID = cs.ClassID
  LEFT JOIN staff s             ON s.StaffID = cs.StaffID
  LEFT JOIN room r              ON r.RoomID  = cs.RoomID`;

const COLUMNS = ['ClassID', 'StaffID', 'RoomID', 'MaxCapacity', 'StartDate', 'StartTime', 'EndDate', 'EndTime'];
const optDate = z.preprocess(emptyToUndefined, isoDate.optional());

module.exports = function scheduleRoutes({ db }) {
  const router = express.Router();

  const getSchedule = async (id, conn = db) => {
    const [found] = await conn.query(`SELECT ${SELECT} ${FROM} WHERE cs.ScheduleID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Class schedule not found');
    return found[0];
  };

  /** Shared by create and update: conflicts, room capacity, and (on edit) seats already sold. */
  async function checkSchedule(conn, d, id) {
    const { room } = await assertSlotFree(conn, {
      start: `${d.StartDate} ${d.StartTime}`,
      end: `${d.EndDate} ${d.EndTime}`,
      staffId: d.StaffID,
      roomId: d.RoomID,
      ignore: { schedule: id },
    });
    if (d.MaxCapacity > room.Capacity) {
      throw new HttpError(400, 'Validation failed', [
        { field: 'MaxCapacity', message: `Room ${room.RoomNumber} only holds ${room.Capacity}` },
      ]);
    }
    if (id) {
      const [[{ taken }]] = await conn.query(
        `SELECT COUNT(*) AS taken FROM reservation WHERE ScheduleID = ? AND ReservationStatus IN ('Booked','Attended')`,
        [id]
      );
      if (d.MaxCapacity < taken) {
        throw new HttpError(409, 'Validation failed', [
          { field: 'MaxCapacity', message: `${taken} seats are already booked` },
        ]);
      }
    }
  }

  router.get(
    '/',
    requirePermission('classes:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, {
        classId: optId,
        staffId: optId,
        roomId: optId,
        from: optDate,
        to: optDate,
        upcoming: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
      });
      const where = new Where()
        .search(['g.ClassName', "CONCAT(s.FirstName, ' ', s.LastName)", 'r.RoomNumber'], p.q)
        .addIf(p.classId, 'cs.ClassID = ?')
        .addIf(p.staffId, 'cs.StaffID = ?')
        .addIf(p.roomId, 'cs.RoomID = ?')
        .addIf(p.from, 'cs.StartDate >= ?')
        .addIf(p.to, 'cs.StartDate <= ?');
      if (p.upcoming === 'true') where.add('TIMESTAMP(cs.StartDate, cs.StartTime) >= NOW()');

      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: {
            id: 'cs.ScheduleID',
            start: ['cs.StartDate', 'cs.StartTime'],
            class: 'g.ClassName',
            room: 'r.RoomNumber',
          },
          defaultSort: { key: 'start' },
          idColumn: 'cs.ScheduleID',
        })
      );
    })
  );

  router.get(
    '/:id',
    requirePermission('classes:read'),
    wrap(async (req, res) => {
      res.json(await getSchedule(parseId(req.params.id)));
    })
  );

  router.post(
    '/',
    requirePermission('schedules:write'),
    wrap(async (req, res) => {
      const d = validate(scheduleSchema, req.body);
      const created = await withTransaction(db, async (conn) => {
        await checkSchedule(conn, d);
        const [result] = await conn.query(
          `INSERT INTO classschedule (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
          COLUMNS.map((c) => d[c])
        );
        return getSchedule(result.insertId, conn);
      });
      res.status(201).json(created);
    })
  );

  router.put(
    '/:id',
    requirePermission('schedules:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(scheduleSchema, req.body);
      const updated = await withTransaction(db, async (conn) => {
        const [existing] = await conn.query('SELECT ScheduleID FROM classschedule WHERE ScheduleID = ? FOR UPDATE', [
          id,
        ]);
        if (!existing.length) throw new HttpError(404, 'Class schedule not found');
        await checkSchedule(conn, d, id);
        await conn.query(`UPDATE classschedule SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE ScheduleID = ?`, [
          ...COLUMNS.map((c) => d[c]),
          id,
        ]);
        return getSchedule(id, conn);
      });
      res.json(updated);
    })
  );

  router.delete(
    '/:id',
    requirePermission('schedules:write'),
    wrap(async (req, res) => {
      const [result] = await db.query('DELETE FROM classschedule WHERE ScheduleID = ?', [parseId(req.params.id)]);
      if (result.affectedRows === 0) throw new HttpError(404, 'Class schedule not found');
      res.status(204).end();
    })
  );

  return router;
};
