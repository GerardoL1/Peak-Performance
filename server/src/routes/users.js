const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, userCreateSchema, userUpdateSchema, needsStaff, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');

const SELECT = `u.UserID, u.Email, u.Role, u.StaffID, u.IsActive, u.CreatedAt, u.LastLoginAt,
                s.FirstName AS StaffFirstName, s.LastName AS StaffLastName`;
const FROM = 'FROM users u LEFT JOIN staff s ON s.StaffID = u.StaffID';

module.exports = function userRoutes({ db, auth }) {
  const router = express.Router();
  router.use(requirePermission('users:manage'));

  const getUser = async (id) => {
    const [found] = await db.query(`SELECT ${SELECT} ${FROM} WHERE u.UserID = ?`, [id]);
    if (!found.length) throw new HttpError(404, 'User not found');
    return found[0];
  };

  router.get(
    '/',
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, {
        role: z.enum(['manager', 'front_desk', 'trainer', 'therapist']).optional(),
      });
      const where = new Where().search(['u.Email', 's.FirstName', 's.LastName'], p.q).addIf(p.role, 'u.Role = ?');
      res.json(
        await paginate(db, p, {
          select: SELECT,
          from: FROM,
          where,
          sortable: { id: 'u.UserID', email: 'u.Email', role: 'u.Role', lastLogin: 'u.LastLoginAt' },
          defaultSort: { key: 'email' },
          idColumn: 'u.UserID',
        })
      );
    })
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const d = validate(userCreateSchema, req.body);
      const hash = await auth.hashPassword(d.Password);
      const [result] = await db.query('INSERT INTO users (Email, PasswordHash, Role, StaffID) VALUES (?, ?, ?, ?)', [
        d.Email,
        hash,
        d.Role,
        d.StaffID,
      ]);
      res.status(201).json(await getUser(result.insertId));
    })
  );

  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(userUpdateSchema, req.body);
      const current = await getUser(id);

      // A manager locking themselves out (or removing the last manager) leaves
      // nobody able to manage accounts.
      if (id === req.user.UserID && (d.IsActive === false || (d.Role && d.Role !== 'manager'))) {
        throw new HttpError(409, 'You cannot deactivate or demote your own account');
      }

      const role = d.Role ?? current.Role;
      const staffId = d.StaffID === undefined ? current.StaffID : d.StaffID;
      if (needsStaff(role) && staffId === null) {
        throw new HttpError(400, 'Validation failed', [
          { field: 'StaffID', message: 'Trainer and therapist logins must be linked to a staff member' },
        ]);
      }

      const sets = ['Role = ?', 'StaffID = ?'];
      const params = [role, staffId];
      if (d.IsActive !== undefined) {
        sets.push('IsActive = ?');
        params.push(d.IsActive ? 1 : 0);
      }
      if (d.Password) {
        sets.push('PasswordHash = ?');
        params.push(await auth.hashPassword(d.Password));
      }
      // Any change to access invalidates the user's existing sessions.
      if (d.Password || d.IsActive === false || role !== current.Role || staffId !== current.StaffID) {
        sets.push('TokenVersion = TokenVersion + 1');
      }

      await db.query(`UPDATE users SET ${sets.join(', ')} WHERE UserID = ?`, [...params, id]);
      res.json(await getUser(id));
    })
  );

  return router;
};
