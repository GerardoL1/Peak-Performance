const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, memberSchema, optId } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');

const SELECT = 'm.*, p.PlanName, p.MonthlyFee';
const FROM = 'FROM member m LEFT JOIN membershipplan p ON p.PlanID = m.PlanID';

const COLUMNS = [
  'FirstName',
  'LastName',
  'Email',
  'Phone',
  'Address',
  'DOB',
  'EmergencyContact',
  'MembershipStartDate',
  'PlanID',
];
const values = (d) => COLUMNS.map((c) => d[c]);

module.exports = function memberRoutes({ db }) {
  const router = express.Router();

  const getMember = async (id) => {
    const [found] = await db.query(`SELECT ${SELECT} ${FROM} WHERE m.MemberID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Member not found');
    return found[0];
  };

  router.get(
    '/',
    requirePermission('members:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, { planId: optId });
      const where = new Where()
        .search(["CONCAT(m.FirstName, ' ', m.LastName)", 'm.Email', 'm.Phone'], p.q)
        .addIf(p.planId, 'm.PlanID = ?');
      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: {
            id: 'm.MemberID',
            name: ['m.LastName', 'm.FirstName'],
            email: 'm.Email',
            startDate: 'm.MembershipStartDate',
            plan: 'p.MonthlyFee',
          },
          defaultSort: { key: 'id' },
          idColumn: 'm.MemberID',
        })
      );
    })
  );

  router.get(
    '/:id',
    requirePermission('members:read'),
    wrap(async (req, res) => {
      res.json(await getMember(parseId(req.params.id)));
    })
  );

  router.post(
    '/',
    requirePermission('members:write'),
    wrap(async (req, res) => {
      const d = validate(memberSchema, req.body);
      const [result] = await db.query(
        `INSERT INTO member (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
        values(d)
      );
      res.status(201).json(await getMember(result.insertId));
    })
  );

  router.put(
    '/:id',
    requirePermission('members:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(memberSchema, req.body);
      const [result] = await db.query(
        `UPDATE member SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE MemberID = ?`,
        [...values(d), id]
      );
      if (result.affectedRows === 0) throw new HttpError(404, 'Member not found');
      res.json(await getMember(id));
    })
  );

  router.delete(
    '/:id',
    requirePermission('members:delete'),
    wrap(async (req, res) => {
      const [result] = await db.query('DELETE FROM member WHERE MemberID = ?', [parseId(req.params.id)]);
      if (result.affectedRows === 0) throw new HttpError(404, 'Member not found');
      res.status(204).end();
    })
  );

  return router;
};
