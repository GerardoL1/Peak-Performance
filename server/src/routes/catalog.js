// Reference tables (a handful of rows each). These return plain arrays rather
// than paginated lists because the UI always needs all of them, e.g. for dropdowns.

const express = require('express');
const { wrap } = require('../errors');
const { requirePermission } = require('../auth');
const { rows } = require('../db');

module.exports = function catalogRoutes({ db }) {
  const router = express.Router();
  router.use(requirePermission('catalog:read'));

  router.get(
    '/facilities',
    wrap(async (req, res) => {
      res.json(
        await rows(
          db,
          `
      SELECT f.*, (SELECT COUNT(*) FROM room r WHERE r.FacilityID = f.FacilityID) AS RoomCount
        FROM facility f ORDER BY f.FacilityID`
        )
      );
    })
  );

  router.get(
    '/rooms',
    wrap(async (req, res) => {
      res.json(
        await rows(
          db,
          `
      SELECT r.*, f.FacilityName FROM room r LEFT JOIN facility f ON f.FacilityID = r.FacilityID
       ORDER BY r.FacilityID, r.RoomNumber`
        )
      );
    })
  );

  router.get(
    '/membership-plans',
    wrap(async (req, res) => {
      res.json(
        await rows(
          db,
          `
      SELECT p.*, (SELECT COUNT(*) FROM member m WHERE m.PlanID = p.PlanID) AS MemberCount
        FROM membershipplan p ORDER BY p.MonthlyFee`
        )
      );
    })
  );

  router.get(
    '/roles',
    wrap(async (req, res) => {
      res.json(await rows(db, 'SELECT * FROM role ORDER BY RoleID'));
    })
  );

  // Everything the forms' dropdowns need, in one round trip. Members are NOT here:
  // there can be thousands, so forms search them via GET /api/members?q=.
  router.get(
    '/lookups',
    wrap(async (req, res) => {
      const [plans, roles, classes, rooms, staff] = await Promise.all([
        rows(db, 'SELECT PlanID, PlanName, MonthlyFee FROM membershipplan ORDER BY MonthlyFee'),
        rows(db, 'SELECT RoleID, RoleName FROM role ORDER BY RoleName'),
        rows(db, 'SELECT ClassID, ClassName, Duration FROM groupfitnessclass ORDER BY ClassName'),
        rows(
          db,
          `SELECT r.RoomID, r.RoomNumber, r.Capacity, f.FacilityName
                  FROM room r LEFT JOIN facility f ON f.FacilityID = r.FacilityID
                 ORDER BY f.FacilityName, r.RoomNumber`
        ),
        rows(
          db,
          `SELECT s.StaffID, s.FirstName, s.LastName, r.RoleName
                  FROM staff s LEFT JOIN role r ON r.RoleID = s.RoleID
                 ORDER BY s.LastName, s.FirstName`
        ),
      ]);
      res.json({ plans, roles, classes, rooms, staff });
    })
  );

  return router;
};
