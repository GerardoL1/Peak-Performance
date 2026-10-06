-- Optional mock data so the app looks lived-in.
-- Every person here is fictional (emails end in @mockmail.test, phones are 555 numbers).
-- Dates are relative to the day you run it: the past 30–60 days plus the next 14.
--
-- Development/demo databases only. Run after seed.sql (it uses its staff, rooms and
-- classes). Only INSERTs, so the app's peak_app user can run it. Safe to re-run:
-- rows that already exist are skipped, so a later run just fills in newer dates.

USE peakperformance;

-- ── Members: 60 fictional people across all plans, joined over the past 2 years ─
INSERT INTO member (FirstName, LastName, Email, Phone, Address, DOB, EmergencyContact, MembershipStartDate, PlanID)
SELECT p.first, p.last,
       LOWER(CONCAT(p.first, '.', p.last, p.i, '@mockmail.test')),
       CONCAT('555-', LPAD(2000 + p.i, 4, '0')),
       CONCAT(100 + p.i * 7, ' ', ELT(1 + p.i % 8, 'Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Birch', 'Willow', 'Aspen'),
              ' ', ELT(1 + p.i % 4, 'St', 'Ave', 'Dr', 'Ln'), ', Dallas TX'),
       DATE('1972-01-01') + INTERVAL ((p.i * 197) % 11000) DAY,
       CONCAT(ELT(1 + (p.i * 3) % 10, 'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew'),
              ' ', p.last, ' 555-', LPAD(3000 + p.i, 4, '0')),
       CURDATE() - INTERVAL ((p.i * 11) % 730) DAY,
       ELT(1 + p.i % 10, 1, 1, 2, 2, 2, 3, 3, 4, 5, 1)
  FROM (
    WITH RECURSIVE n AS (SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 60)
    SELECT i,
           ELT(1 + (i * 7) % 30, 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Mateo', 'Isabella', 'Lucas',
               'Mia', 'Levi', 'Amelia', 'Ethan', 'Harper', 'Diego', 'Evelyn', 'Aiden', 'Camila', 'Caleb',
               'Priya', 'Omar', 'Zoe', 'Hiro', 'Nora', 'Andre', 'Layla', 'Marcus', 'Chloe', 'Ivan') AS first,
           ELT(1 + (i * 11) % 30, 'Garcia', 'Nguyen', 'Patel', 'Kim', 'Rivera', 'Brooks', 'Hughes', 'Price', 'Bennett', 'Reyes',
               'Foster', 'Coleman', 'Ortiz', 'Jenkins', 'Perry', 'Powell', 'Long', 'Sanders', 'Ross', 'Flores',
               'Ward', 'Cruz', 'Morales', 'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace') AS last
      FROM n
  ) p
 WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.Email = LOWER(CONCAT(p.first, '.', p.last, p.i, '@mockmail.test')));

-- ── Group classes: past 30 days + next 14, 07:00 / 12:00 / 18:00 (no noon class on
--    weekends). Each time slot has its own studio and instructors rotate, so no clashes.
INSERT INTO classschedule (MaxCapacity, StartDate, StartTime, EndDate, EndTime, ClassID, StaffID, RoomID)
SELECT c.cap, c.day, c.start_time, c.day, ADDTIME(c.start_time, SEC_TO_TIME(g.Duration * 60)), g.ClassID, c.staff, c.room
  FROM (
    WITH RECURSIVE d AS (SELECT -30 AS n UNION ALL SELECT n + 1 FROM d WHERE n < 13),
         s AS (SELECT 0 AS slot UNION ALL SELECT 1 UNION ALL SELECT 2)
    SELECT CURDATE() + INTERVAL d.n DAY AS day,
           ELT(s.slot + 1, '07:00:00', '12:00:00', '18:00:00') AS start_time,
           1 + ((d.n + 30) * 3 + s.slot * 5) % 8 AS class_id,
           11 + ((d.n + 30) + s.slot * 2) % 5 AS staff,
           5 + s.slot AS room,
           ELT(s.slot + 1, 20, 16, 20) AS cap
      FROM d CROSS JOIN s
  ) c
  JOIN groupfitnessclass g ON g.ClassID = c.class_id
 WHERE NOT (c.start_time = '12:00:00' AND DAYOFWEEK(c.day) IN (1, 7))
   AND NOT EXISTS (SELECT 1 FROM classschedule x
                    WHERE x.StartDate = c.day AND x.StartTime = c.start_time AND x.RoomID = c.room);

-- ── Reservations: fill each of those classes 40–100% (fewer bookings further out).
--    Past classes are Attended (about 1 in 9 Cancelled). Upcoming ones are Booked.
INSERT INTO reservation (ReservationDate, ReservationStatus, ScheduleID, MemberID)
SELECT LEAST(CURDATE(), r.StartDate - INTERVAL (1 + r.h % 6) DAY),
       CASE WHEN r.StartDate >= CURDATE() THEN 'Booked'
            WHEN r.h % 9 = 0 THEN 'Cancelled'
            ELSE 'Attended' END,
       r.ScheduleID, r.MemberID
  FROM (
    SELECT cs.ScheduleID, cs.StartDate, m.MemberID, CRC32(CONCAT(cs.ScheduleID, '-', m.MemberID)) AS h,
           ROW_NUMBER() OVER (PARTITION BY cs.ScheduleID ORDER BY CRC32(CONCAT(cs.ScheduleID, '-', m.MemberID))) AS pick,
           FLOOR(cs.MaxCapacity * (0.4 + (CRC32(cs.ScheduleID) % 61) / 100)
                 * GREATEST(0.3, 1 - GREATEST(DATEDIFF(cs.StartDate, CURDATE()), 0) / 20)) AS target
      FROM classschedule cs
      CROSS JOIN member m
     WHERE cs.StartDate BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 13 DAY
       AND cs.StaffID BETWEEN 11 AND 15
  ) r
 WHERE r.pick <= r.target
   AND NOT EXISTS (SELECT 1 FROM reservation x WHERE x.ScheduleID = r.ScheduleID AND x.MemberID = r.MemberID)
   -- never overbook a class that already had reservations from an earlier run
   AND (SELECT COUNT(*) FROM reservation y
         WHERE y.ScheduleID = r.ScheduleID AND y.ReservationStatus IN ('Booked', 'Attended')) = 0;

-- ── Check-ins: last 60 days, ~40 a day on weekdays and fewer on weekends,
--    clustered around mornings, lunch and after work. Days that already have
--    check-ins are skipped.
INSERT INTO checkin (CheckInTime, MemberID)
SELECT t.ts, t.MemberID
  FROM (
    WITH RECURSIVE d AS (SELECT 0 AS n UNION ALL SELECT n + 1 FROM d WHERE n < 59)
    SELECT TIMESTAMP(CURDATE() - INTERVAL d.n DAY,
                     MAKETIME(ELT(1 + CRC32(CONCAT(d.n, 'h', m.MemberID)) % 10, 6, 7, 7, 8, 12, 12, 17, 18, 18, 19),
                              CRC32(CONCAT(d.n, 'm', m.MemberID)) % 60, 0)) AS ts,
           m.MemberID,
           CURDATE() - INTERVAL d.n DAY AS day,
           CRC32(CONCAT(d.n, '-', m.MemberID)) % 100 AS roll,
           DAYOFWEEK(CURDATE() - INTERVAL d.n DAY) AS dow
      FROM d CROSS JOIN member m
  ) t
 WHERE t.roll < IF(t.dow IN (1, 7), 35, 60)
   AND t.ts <= NOW()
   AND NOT EXISTS (SELECT 1 FROM checkin c WHERE c.CheckInTime >= t.day AND c.CheckInTime < t.day + INTERVAL 1 DAY);

-- ── Personal training: past 30 days + next 14. Weekdays at 10:00 and 15:00,
--    Saturdays at 10:00, rotating trainers (staff 5-10) and mock members.
INSERT INTO personaltrainingsession (StartDate, StartTime, EndDate, EndTime, SessionNotes, StaffID, MemberID)
SELECT t.day, t.start_time, t.day, ADDTIME(t.start_time, '01:00:00'),
       ELT(1 + t.h % 10, 'Initial assessment and goal setting', 'Upper body strength', 'Lower body and mobility',
           'Core stability and balance', 'Conditioning intervals', 'Deadlift technique review',
           'Progress check and program update', 'Posture and flexibility work', 'Endurance base building',
           'Full body circuit'),
       t.staff, dm.MemberID
  FROM (
    WITH RECURSIVE d AS (SELECT -30 AS n UNION ALL SELECT n + 1 FROM d WHERE n < 13),
         s AS (SELECT 0 AS slot UNION ALL SELECT 1)
    SELECT CURDATE() + INTERVAL d.n DAY AS day,
           ELT(s.slot + 1, '10:00:00', '15:00:00') AS start_time,
           5 + ((d.n + 30) * 2 + s.slot) % 6 AS staff,
           CRC32(CONCAT('pt', d.n, '-', s.slot)) AS h,
           DAYOFWEEK(CURDATE() + INTERVAL d.n DAY) AS dow, s.slot
      FROM d CROSS JOIN s
  ) t
  JOIN (SELECT MemberID, ROW_NUMBER() OVER (ORDER BY MemberID) AS rn
          FROM member WHERE Email LIKE '%@mockmail.test') dm
    ON dm.rn = 1 + t.h % 60
 WHERE t.dow <> 1 AND NOT (t.dow = 7 AND t.slot = 1)
   AND NOT EXISTS (SELECT 1 FROM personaltrainingsession x
                    WHERE x.StaffID = t.staff AND x.StartDate = t.day AND x.StartTime = t.start_time);

-- ── Physical therapy: past 30 days + next 14, on roughly two of every three weekdays,
--    09:00 and 14:00 with the two therapists (staff 16-17) alternating.
INSERT INTO physicaltherapysession (TreatmentNotes, AppointmentDate, DurationMinutes, ReferralSource, StaffID, MemberID)
SELECT ELT(1 + t.h % 8, 'Lower back pain: core activation and stretching', 'Knee rehab: quad strengthening',
           'Shoulder impingement: mobility work', 'Ankle sprain: balance and proprioception',
           'Post-surgery ACL rehab: range of motion', 'Hamstring strain: eccentric loading',
           'Neck tension: posture correction', 'Hip flexor tightness: soft tissue work'),
       TIMESTAMP(t.day, t.start_time),
       ELT(1 + t.h % 4, 45, 60, 60, 30),
       ELT(1 + (t.h DIV 7) % 4, 'Primary Care Physician', 'Orthopedic Specialist', 'Sports Medicine Doctor', 'Self-referral'),
       t.staff, dm.MemberID
  FROM (
    WITH RECURSIVE d AS (SELECT -30 AS n UNION ALL SELECT n + 1 FROM d WHERE n < 13),
         s AS (SELECT 0 AS slot UNION ALL SELECT 1)
    SELECT CURDATE() + INTERVAL d.n DAY AS day, d.n,
           ELT(s.slot + 1, '09:00:00', '14:00:00') AS start_time,
           16 + ((d.n + 30) + s.slot) % 2 AS staff,
           CRC32(CONCAT('pt-therapy', d.n, '-', s.slot)) AS h,
           DAYOFWEEK(CURDATE() + INTERVAL d.n DAY) AS dow
      FROM d CROSS JOIN s
  ) t
  JOIN (SELECT MemberID, ROW_NUMBER() OVER (ORDER BY MemberID) AS rn
          FROM member WHERE Email LIKE '%@mockmail.test') dm
    ON dm.rn = 1 + (t.h DIV 3) % 60
 WHERE t.dow BETWEEN 2 AND 6
   AND (t.n + 30) % 3 <> 0
   AND NOT EXISTS (SELECT 1 FROM physicaltherapysession x
                    WHERE x.StaffID = t.staff AND x.AppointmentDate = TIMESTAMP(t.day, t.start_time));
