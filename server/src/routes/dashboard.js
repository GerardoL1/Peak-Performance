// KPIs and chart data for the dashboard, computed in SQL. "Today" is the
// database's CURDATE(), so the numbers don't depend on the API server's time zone.

const express = require('express');
const { wrap } = require('../errors');
const { requirePermission } = require('../auth');
const { can } = require('../permissions');
const { rows } = require('../db');

const DAYS = 30;

/** Fills in the days with no check-ins so the chart has a continuous x-axis. */
function fillDays(today, counts) {
  const byDay = new Map(counts.map((r) => [r.day, r.count]));
  const end = new Date(`${today}T00:00:00Z`);
  const series = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    series.push({ day, count: byDay.get(day) ?? 0 });
  }
  return series;
}

module.exports = function dashboardRoutes({ db }) {
  const router = express.Router();

  router.get(
    '/',
    requirePermission('dashboard:read'),
    wrap(async (req, res) => {
      const [[kpi], perDay, perHour, reservationStatus, planMix, upcoming, classFill] = await Promise.all([
        rows(
          db,
          `
        SELECT CURDATE() AS today,
               (SELECT COUNT(*) FROM member) AS totalMembers,
               (SELECT COUNT(*) FROM member
                 WHERE MembershipStartDate >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS newMembersThisMonth,
               (SELECT COALESCE(SUM(p.MonthlyFee), 0) FROM member m
                  JOIN membershipplan p ON p.PlanID = m.PlanID) AS monthlyRecurringRevenue,
               (SELECT COUNT(*) FROM checkin WHERE CheckInTime >= CURDATE()) AS checkInsToday,
               (SELECT COUNT(*) FROM checkin WHERE CheckInTime >= CURDATE() - INTERVAL 6 DAY) AS checkInsLast7Days,
               (SELECT COUNT(*) FROM checkin
                 WHERE CheckInTime >= CURDATE() - INTERVAL 13 DAY
                   AND CheckInTime <  CURDATE() - INTERVAL 6 DAY) AS checkInsPrev7Days,
               (SELECT COUNT(*) FROM classschedule
                 WHERE TIMESTAMP(StartDate, StartTime) >= NOW()
                   AND StartDate < CURDATE() + INTERVAL 7 DAY) AS classesNext7Days,
               (SELECT COUNT(*) FROM personaltrainingsession
                 WHERE TIMESTAMP(StartDate, StartTime) >= NOW()
                   AND StartDate < CURDATE() + INTERVAL 7 DAY) AS trainingNext7Days`
        ),
        rows(
          db,
          `
        SELECT DATE(CheckInTime) AS day, COUNT(*) AS count FROM checkin
         WHERE CheckInTime >= CURDATE() - INTERVAL ${DAYS - 1} DAY
         GROUP BY DATE(CheckInTime)`
        ),
        rows(
          db,
          `
        SELECT HOUR(CheckInTime) AS hour, COUNT(*) AS count FROM checkin
         WHERE CheckInTime >= CURDATE() - INTERVAL ${DAYS - 1} DAY
         GROUP BY HOUR(CheckInTime) ORDER BY hour`
        ),
        rows(
          db,
          `
        SELECT ReservationStatus AS status, COUNT(*) AS count FROM reservation
         GROUP BY ReservationStatus`
        ),
        rows(
          db,
          `
        SELECT p.PlanID, p.PlanName, p.MonthlyFee, COUNT(m.MemberID) AS members,
               COUNT(m.MemberID) * p.MonthlyFee AS revenue
          FROM membershipplan p LEFT JOIN member m ON m.PlanID = p.PlanID
         GROUP BY p.PlanID, p.PlanName, p.MonthlyFee
         ORDER BY p.MonthlyFee`
        ),
        rows(
          db,
          `
        SELECT cs.ScheduleID, g.ClassName, cs.StartDate, cs.StartTime, cs.MaxCapacity, r.RoomNumber,
               s.FirstName AS StaffFirstName, s.LastName AS StaffLastName,
               (SELECT COUNT(*) FROM reservation rv
                 WHERE rv.ScheduleID = cs.ScheduleID AND rv.ReservationStatus IN ('Booked','Attended')) AS Booked
          FROM classschedule cs
          JOIN groupfitnessclass g ON g.ClassID = cs.ClassID
          LEFT JOIN room r  ON r.RoomID  = cs.RoomID
          LEFT JOIN staff s ON s.StaffID = cs.StaffID
         WHERE TIMESTAMP(cs.StartDate, cs.StartTime) >= NOW()
         ORDER BY cs.StartDate, cs.StartTime
         LIMIT 6`
        ),
        rows(
          db,
          `
        SELECT g.ClassName, COUNT(*) AS sessions,
               ROUND(AVG(LEAST(x.taken / x.MaxCapacity, 1)) * 100) AS avgFillPct,
               SUM(x.attended) AS attended
          FROM (SELECT cs.ClassID, cs.MaxCapacity,
                       COALESCE(SUM(rv.ReservationStatus IN ('Booked','Attended')), 0) AS taken,
                       COALESCE(SUM(rv.ReservationStatus = 'Attended'), 0) AS attended
                  FROM classschedule cs
                  LEFT JOIN reservation rv ON rv.ScheduleID = cs.ScheduleID
                 GROUP BY cs.ScheduleID, cs.ClassID, cs.MaxCapacity) x
          JOIN groupfitnessclass g ON g.ClassID = x.ClassID
         GROUP BY g.ClassID, g.ClassName
         ORDER BY avgFillPct DESC, g.ClassName
         LIMIT 8`
        ),
      ]);

      const showFinance = can(req.user.Role, 'finance:read');
      const byStatus = Object.fromEntries(reservationStatus.map((r) => [r.status, r.count]));

      res.json({
        today: kpi.today,
        kpis: {
          totalMembers: kpi.totalMembers,
          newMembersThisMonth: kpi.newMembersThisMonth,
          monthlyRecurringRevenue: showFinance ? kpi.monthlyRecurringRevenue : null,
          checkInsToday: kpi.checkInsToday,
          checkInsLast7Days: kpi.checkInsLast7Days,
          checkInsPrev7Days: kpi.checkInsPrev7Days,
          classesNext7Days: kpi.classesNext7Days,
          trainingNext7Days: kpi.trainingNext7Days,
        },
        checkInsByDay: fillDays(kpi.today, perDay),
        checkInsByHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: perHour.find((h) => h.hour === hour)?.count ?? 0,
        })),
        reservationsByStatus: ['Booked', 'Attended', 'Cancelled'].map((status) => ({
          status,
          count: byStatus[status] ?? 0,
        })),
        planMix: planMix.map((p) => ({
          PlanName: p.PlanName,
          members: p.members,
          revenue: showFinance ? Number(p.revenue) : null,
        })),
        upcomingClasses: upcoming,
        classFill: classFill.map((c) => ({
          ...c,
          avgFillPct: Number(c.avgFillPct ?? 0),
          attended: Number(c.attended ?? 0),
        })),
      });
    })
  );

  return router;
};
