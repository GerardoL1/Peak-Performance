const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, checkInSchema, optId, isoDate, emptyToUndefined, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');

const SELECT = 'c.CheckInID, c.CheckInTime, c.MemberID, m.FirstName, m.LastName, p.PlanName';
const FROM = `FROM checkin c
  LEFT JOIN member m ON m.MemberID = c.MemberID
  LEFT JOIN membershipplan p ON p.PlanID = m.PlanID`;
const optDate = z.preprocess(emptyToUndefined, isoDate.optional());

module.exports = function checkInRoutes({ db }) {
  const router = express.Router();

  router.get(
    '/',
    requirePermission('checkins:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, { memberId: optId, from: optDate, to: optDate });
      const where = new Where()
        .search(["CONCAT(m.FirstName, ' ', m.LastName)", 'm.Email'], p.q)
        .addIf(p.memberId, 'c.MemberID = ?')
        .addIf(p.from, 'c.CheckInTime >= ?')
        .addIf(p.to, 'c.CheckInTime < DATE_ADD(?, INTERVAL 1 DAY)');
      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: { id: 'c.CheckInID', time: 'c.CheckInTime', member: ['m.LastName', 'm.FirstName'] },
          defaultSort: { key: 'time', order: 'desc' },
          idColumn: 'c.CheckInID',
        })
      );
    })
  );

  // The timestamp is set by the database, never by the client, so attendance can't be forged.
  router.post(
    '/',
    requirePermission('checkins:create'),
    wrap(async (req, res) => {
      const { MemberID } = validate(checkInSchema, req.body);
      const [result] = await db.query('INSERT INTO checkin (MemberID) VALUES (?)', [MemberID]);
      const [found] = await db.query(`SELECT ${SELECT} ${FROM} WHERE c.CheckInID = ?`, [result.insertId]);
      if (!found.length) throw new HttpError(500, 'Check-in was not saved');
      res.status(201).json(found[0]);
    })
  );

  return router;
};
