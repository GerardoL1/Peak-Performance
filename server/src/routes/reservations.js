const express = require('express');
const { HttpError, wrap } = require('../errors');
const {
  validate,
  parseId,
  reservationCreateSchema,
  reservationStatusSchema,
  optId,
  emptyToUndefined,
  z,
} = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');
const { withTransaction } = require('../db');

const SELECT = `r.ReservationID, r.ReservationDate, r.ReservationStatus, r.ScheduleID,
                g.ClassName, cs.StartDate, cs.StartTime, cs.EndTime,
                m.MemberID, m.FirstName AS MemberFirstName, m.LastName AS MemberLastName`;
const FROM = `FROM reservation r
  LEFT JOIN member m            ON m.MemberID    = r.MemberID
  LEFT JOIN classschedule cs    ON cs.ScheduleID = r.ScheduleID
  LEFT JOIN groupfitnessclass g ON g.ClassID     = cs.ClassID`;

module.exports = function reservationRoutes({ db }) {
  const router = express.Router();

  const getReservation = async (id, conn = db) => {
    const [found] = await conn.query(`SELECT ${SELECT} ${FROM} WHERE r.ReservationID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Reservation not found');
    return found[0];
  };

  router.get(
    '/',
    requirePermission('reservations:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, {
        status: z.preprocess(emptyToUndefined, z.enum(['Booked', 'Cancelled', 'Attended']).optional()),
        scheduleId: optId,
        memberId: optId,
      });
      const where = new Where()
        .search(["CONCAT(m.FirstName, ' ', m.LastName)", 'g.ClassName'], p.q)
        .addIf(p.status, 'r.ReservationStatus = ?')
        .addIf(p.scheduleId, 'r.ScheduleID = ?')
        .addIf(p.memberId, 'r.MemberID = ?');

      const page = await paginate(db, p, {
        select: SELECT,
        from: FROM,
        where,
        sortable: {
          id: 'r.ReservationID',
          date: 'r.ReservationDate',
          classStart: ['cs.StartDate', 'cs.StartTime'],
          member: ['m.LastName', 'm.FirstName'],
          status: 'r.ReservationStatus',
        },
        defaultSort: { key: 'id', order: 'desc' },
        idColumn: 'r.ReservationID',
      });

      // Status counts for the filter chips, respecting the search but not the status filter.
      const countWhere = new Where()
        .search(["CONCAT(m.FirstName, ' ', m.LastName)", 'g.ClassName'], p.q)
        .addIf(p.scheduleId, 'r.ScheduleID = ?')
        .addIf(p.memberId, 'r.MemberID = ?');
      const [counts] = await db.query(
        `SELECT r.ReservationStatus AS status, COUNT(*) AS count ${FROM} ${countWhere.toSql()} GROUP BY r.ReservationStatus`,
        countWhere.params
      );
      page.meta.statusCounts = Object.fromEntries(counts.map((c) => [c.status, c.count]));
      res.json(page);
    })
  );

  // Books a class. The schedule row is locked for the duration of the transaction so two
  // simultaneous requests can't both take the last seat (capacity check + insert is atomic).
  router.post(
    '/',
    requirePermission('reservations:create'),
    wrap(async (req, res) => {
      const { ScheduleID, MemberID } = validate(reservationCreateSchema, req.body);
      const created = await withTransaction(db, async (conn) => {
        const [scheds] = await conn.query(
          `SELECT cs.MaxCapacity, r.Capacity AS RoomCapacity, TIMESTAMP(cs.StartDate, cs.StartTime) <= NOW() AS started
           FROM classschedule cs LEFT JOIN room r ON r.RoomID = cs.RoomID
          WHERE cs.ScheduleID = ? FOR UPDATE OF cs`,
          [ScheduleID]
        );
        if (!scheds.length) throw new HttpError(404, 'Class schedule not found');
        const sched = scheds[0];
        if (sched.started) throw new HttpError(409, 'This class has already started');

        const capacity = Math.min(sched.MaxCapacity, sched.RoomCapacity ?? sched.MaxCapacity);

        const [dupes] = await conn.query(
          `SELECT 1 FROM reservation
          WHERE ScheduleID = ? AND MemberID = ? AND ReservationStatus IN ('Booked','Attended') LIMIT 1`,
          [ScheduleID, MemberID]
        );
        if (dupes.length) throw new HttpError(409, 'This member already has a reservation for that class');

        const [[{ taken }]] = await conn.query(
          `SELECT COUNT(*) AS taken FROM reservation
          WHERE ScheduleID = ? AND ReservationStatus IN ('Booked','Attended')`,
          [ScheduleID]
        );
        if (taken >= capacity) throw new HttpError(409, 'This class is full');

        const [result] = await conn.query(
          `INSERT INTO reservation (ReservationDate, ReservationStatus, ScheduleID, MemberID)
         VALUES (CURDATE(), 'Booked', ?, ?)`,
          [ScheduleID, MemberID]
        );
        return getReservation(result.insertId, conn);
      });
      res.status(201).json(created);
    })
  );

  // Only Booked reservations can change. Reviving a cancelled one would quietly
  // take a seat back, so the member has to book again instead.
  router.patch(
    '/:id',
    requirePermission('reservations:update'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const { ReservationStatus } = validate(reservationStatusSchema, req.body);
      const [result] = await db.query(
        `UPDATE reservation SET ReservationStatus = ? WHERE ReservationID = ? AND ReservationStatus = 'Booked'`,
        [ReservationStatus, id]
      );
      if (result.affectedRows === 0) {
        await getReservation(id); // 404 if it doesn't exist
        throw new HttpError(409, 'Only reservations with status Booked can be changed');
      }
      res.json(await getReservation(id));
    })
  );

  return router;
};
