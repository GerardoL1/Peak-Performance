-- Adds login accounts and what the double-booking checks need.
-- Run it once as root in Workbench, since peak_app can't create or alter tables.
--
--   brand-new database:  schema.sql  -> 002_auth_and_scheduling.sql -> seed.sql
--
-- Then create the first manager login from the server folder:
--   npm run user:create -- --email you@example.com --role manager

USE peakperformance;

-- ── Login accounts ──────────────────────────────────────────────────────────
-- Kept apart from staff so credentials never leak through the staff endpoints.
-- Trainers and therapists link to their staff row, which decides what they can edit.
CREATE TABLE users (
  UserID       INT          NOT NULL AUTO_INCREMENT,
  Email        VARCHAR(100) NOT NULL,
  PasswordHash CHAR(60)     NOT NULL COMMENT 'bcrypt',
  Role         ENUM('manager','front_desk','trainer','therapist') NOT NULL,
  StaffID      INT          NULL,
  IsActive     TINYINT(1)   NOT NULL DEFAULT 1,
  -- Goes up on a password reset, role change or deactivation.
  -- Older sessions stop working right away.
  TokenVersion INT          NOT NULL DEFAULT 0,
  CreatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  LastLoginAt  DATETIME     NULL,
  PRIMARY KEY (UserID),
  CONSTRAINT uq_user_email UNIQUE (Email),
  CONSTRAINT uq_user_staff UNIQUE (StaffID),
  CONSTRAINT chk_user_staff_link CHECK (Role IN ('manager','front_desk') OR StaffID IS NOT NULL),
  -- No ON UPDATE CASCADE: MySQL forbids referential actions on a column used in a CHECK.
  CONSTRAINT fk_user_staff FOREIGN KEY (StaffID) REFERENCES staff (StaffID)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ── Therapy appointment length ──────────────────────────────────────────────
-- An appointment only had a start time, so "does this overlap?" had no answer.
-- Existing rows get 60 minutes.
ALTER TABLE physicaltherapysession
  ADD COLUMN DurationMinutes INT NOT NULL DEFAULT 60 AFTER AppointmentDate,
  ADD CONSTRAINT chk_therapy_duration CHECK (DurationMinutes BETWEEN 15 AND 480);

-- ── Indexes for the double-booking checks and date-range lists ──────────────
CREATE INDEX idx_schedule_staff_start ON classschedule (StaffID, StartDate);
CREATE INDEX idx_schedule_room_start  ON classschedule (RoomID, StartDate);
CREATE INDEX idx_schedule_start       ON classschedule (StartDate, StartTime);
CREATE INDEX idx_training_staff_start ON personaltrainingsession (StaffID, StartDate);
CREATE INDEX idx_training_member_start ON personaltrainingsession (MemberID, StartDate);
CREATE INDEX idx_therapy_staff_start  ON physicaltherapysession (StaffID, AppointmentDate);
CREATE INDEX idx_therapy_member_start ON physicaltherapysession (MemberID, AppointmentDate);
CREATE INDEX idx_reservation_schedule_status ON reservation (ScheduleID, ReservationStatus);

-- Sanity check: expect the users table and the DurationMinutes column.
SELECT TABLE_NAME, COLUMN_NAME
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND ((TABLE_NAME = 'users' AND COLUMN_NAME = 'Role')
     OR (TABLE_NAME = 'physicaltherapysession' AND COLUMN_NAME = 'DurationMinutes'));
