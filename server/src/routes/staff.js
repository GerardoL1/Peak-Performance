const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, staffSchema, optId } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');

const SELECT = `s.StaffID, s.FirstName, s.LastName, s.Email, s.Phone, s.HireDate, s.RoleID, r.RoleName,
                EXISTS (SELECT 1 FROM users u WHERE u.StaffID = s.StaffID) AS HasLogin`;
const FROM = 'FROM staff s LEFT JOIN role r ON r.RoleID = s.RoleID';

const COLUMNS = ['FirstName', 'LastName', 'Email', 'Phone', 'HireDate', 'RoleID'];

module.exports = function staffRoutes({ db }) {
  const router = express.Router();

  const getStaff = async (id) => {
    const [found] = await db.query(`SELECT ${SELECT} ${FROM} WHERE s.StaffID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'Staff member not found');
    return found[0];
  };

  router.get(
    '/',
    requirePermission('staff:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, { roleId: optId });
      const where = new Where()
        .search(["CONCAT(s.FirstName, ' ', s.LastName)", 's.Email', 's.Phone'], p.q)
        .addIf(p.roleId, 's.RoleID = ?');
      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: {
            id: 's.StaffID',
            name: ['s.LastName', 's.FirstName'],
            role: 'r.RoleName',
            hireDate: 's.HireDate',
          },
          defaultSort: { key: 'name' },
          idColumn: 's.StaffID',
        })
      );
    })
  );

  router.get(
    '/:id',
    requirePermission('staff:read'),
    wrap(async (req, res) => {
      res.json(await getStaff(parseId(req.params.id)));
    })
  );

  router.post(
    '/',
    requirePermission('staff:write'),
    wrap(async (req, res) => {
      const d = validate(staffSchema, req.body);
      const [result] = await db.query(
        `INSERT INTO staff (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
        COLUMNS.map((c) => d[c])
      );
      res.status(201).json(await getStaff(result.insertId));
    })
  );

  router.put(
    '/:id',
    requirePermission('staff:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(staffSchema, req.body);
      const [result] = await db.query(
        `UPDATE staff SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE StaffID = ?`,
        [...COLUMNS.map((c) => d[c]), id]
      );
      if (result.affectedRows === 0) throw new HttpError(404, 'Staff member not found');
      res.json(await getStaff(id));
    })
  );

  router.delete(
    '/:id',
    requirePermission('staff:write'),
    wrap(async (req, res) => {
      const [result] = await db.query('DELETE FROM staff WHERE StaffID = ?', [parseId(req.params.id)]);
      if (result.affectedRows === 0) throw new HttpError(404, 'Staff member not found');
      res.status(204).end();
    })
  );

  return router;
};
