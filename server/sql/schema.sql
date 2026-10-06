-- Builds the Peak Performance database from scratch.
-- Works on MySQL 8.0.16+ (CHECK constraints are enforced from that version).
--
-- Table and database names are all lowercase on purpose: MySQL treats them as
-- case-sensitive on Linux, so mixed case works on Windows and breaks in Docker/CI.
--
-- SAFE BY DEFAULT: this script does NOT drop anything. If a database called
-- peakperformance already exists (on Windows the name is case-insensitive, so
-- "PeakPerformance" counts) it stops with an error. To start over on purpose,
-- run `DROP DATABASE peakperformance;` yourself first.

CREATE DATABASE peakperformance CHARACTER SET utf8mb4;
USE peakperformance;

-- ── Lookup tables ───────────────────────────────────────────────────────────

CREATE TABLE role (
  RoleID          INT          NOT NULL AUTO_INCREMENT,
  RoleName        VARCHAR(50)  NOT NULL,
  RoleDescription VARCHAR(255) NULL,
  PRIMARY KEY (RoleID),
  CONSTRAINT uq_role_name UNIQUE (RoleName)
) ENGINE=InnoDB;

CREATE TABLE membershipplan (
  PlanID              INT           NOT NULL AUTO_INCREMENT,
  PlanName            VARCHAR(50)   NOT NULL,
  MonthlyFee          DECIMAL(10,2) NOT NULL,
  BenefitsDescription VARCHAR(255)  NULL,
  AccessLevel         VARCHAR(50)   NULL,
  PRIMARY KEY (PlanID),
  CONSTRAINT uq_plan_name UNIQUE (PlanName),
  CONSTRAINT chk_plan_fee CHECK (MonthlyFee >= 0)
) ENGINE=InnoDB;

CREATE TABLE facility (
  FacilityID          INT          NOT NULL AUTO_INCREMENT,
  FacilityName        VARCHAR(50)  NOT NULL,
  FacilityType        VARCHAR(50)  NOT NULL,
  FacilityDescription VARCHAR(255) NULL,
  PRIMARY KEY (FacilityID),
  CONSTRAINT uq_facility_name UNIQUE (FacilityName)
) ENGINE=InnoDB;

CREATE TABLE room (
  RoomID     INT         NOT NULL AUTO_INCREMENT,
  RoomNumber VARCHAR(20) NOT NULL,
  Capacity   INT         NOT NULL,
  FacilityID INT         NOT NULL,
  PRIMARY KEY (RoomID),
  CONSTRAINT uq_room_number   UNIQUE (FacilityID, RoomNumber),
  CONSTRAINT chk_room_capacity CHECK (Capacity > 0),
  CONSTRAINT fk_room_facility FOREIGN KEY (FacilityID) REFERENCES facility (FacilityID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE groupfitnessclass (
  ClassID          INT          NOT NULL AUTO_INCREMENT,
  ClassName        VARCHAR(50)  NOT NULL,
  ClassDescription VARCHAR(255) NULL,
  DifficultyLevel  ENUM('Beginner','Intermediate','Advanced') NOT NULL,
  Duration         INT          NOT NULL COMMENT 'minutes',
  PRIMARY KEY (ClassID),
  CONSTRAINT uq_class_name UNIQUE (ClassName),
  CONSTRAINT chk_class_duration CHECK (Duration > 0)
) ENGINE=InnoDB;

-- ── People ──────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  StaffID   INT          NOT NULL AUTO_INCREMENT,
  FirstName VARCHAR(50)  NOT NULL,
  LastName  VARCHAR(50)  NOT NULL,
  Email     VARCHAR(100) NOT NULL,
  Phone     VARCHAR(20)  NULL,
  HireDate  DATE         NULL,
  RoleID    INT          NOT NULL,
  PRIMARY KEY (StaffID),
  CONSTRAINT uq_staff_email UNIQUE (Email),
  CONSTRAINT fk_staff_role FOREIGN KEY (RoleID) REFERENCES role (RoleID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Name, phone, address and email are required.
-- Emergency contact, birthday and start date are optional.
CREATE TABLE member (
  MemberID            INT          NOT NULL AUTO_INCREMENT,
  FirstName           VARCHAR(50)  NOT NULL,
  LastName            VARCHAR(50)  NOT NULL,
  Email               VARCHAR(100) NOT NULL,
  Phone               VARCHAR(20)  NOT NULL,
  Address             VARCHAR(255) NOT NULL,
  DOB                 DATE         NULL,
  EmergencyContact    VARCHAR(100) NULL,
  MembershipStartDate DATE         NULL,
  PlanID              INT          NOT NULL,
  PRIMARY KEY (MemberID),
  CONSTRAINT uq_member_email UNIQUE (Email),
  CONSTRAINT fk_member_plan FOREIGN KEY (PlanID) REFERENCES membershipplan (PlanID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Scheduling ──────────────────────────────────────────────────────────────

CREATE TABLE classschedule (
  ScheduleID  INT  NOT NULL AUTO_INCREMENT,
  MaxCapacity INT  NOT NULL,
  StartDate   DATE NOT NULL,
  StartTime   TIME NOT NULL,
  EndDate     DATE NOT NULL,
  EndTime     TIME NOT NULL,
  ClassID     INT  NOT NULL,
  StaffID     INT  NOT NULL,
  RoomID      INT  NOT NULL,
  PRIMARY KEY (ScheduleID),
  CONSTRAINT chk_schedule_capacity CHECK (MaxCapacity > 0),
  CONSTRAINT chk_schedule_times CHECK (
    EndDate > StartDate OR (EndDate = StartDate AND EndTime > StartTime)
  ),
  CONSTRAINT fk_schedule_class FOREIGN KEY (ClassID) REFERENCES groupfitnessclass (ClassID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_schedule_staff FOREIGN KEY (StaffID) REFERENCES staff (StaffID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_schedule_room  FOREIGN KEY (RoomID)  REFERENCES room (RoomID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reservation (
  ReservationID     INT  NOT NULL AUTO_INCREMENT,
  ReservationDate   DATE NOT NULL,
  ReservationStatus ENUM('Booked','Cancelled','Attended') NOT NULL DEFAULT 'Booked',
  ScheduleID        INT  NOT NULL,
  MemberID          INT  NOT NULL,
  PRIMARY KEY (ReservationID),
  CONSTRAINT fk_reservation_schedule FOREIGN KEY (ScheduleID) REFERENCES classschedule (ScheduleID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_reservation_member   FOREIGN KEY (MemberID)   REFERENCES member (MemberID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Sessions and visits ─────────────────────────────────────────────────────

-- ReservationID links a training session to a class reservation, which is unusual.
-- The API keeps it read-only.
CREATE TABLE personaltrainingsession (
  TrainingID    INT  NOT NULL AUTO_INCREMENT,
  StartDate     DATE NOT NULL,
  StartTime     TIME NOT NULL,
  EndDate       DATE NOT NULL,
  EndTime       TIME NOT NULL,
  SessionNotes  TEXT NULL,
  StaffID       INT  NOT NULL,
  MemberID      INT  NOT NULL,
  ReservationID INT  NULL,
  PRIMARY KEY (TrainingID),
  CONSTRAINT chk_training_times CHECK (
    EndDate > StartDate OR (EndDate = StartDate AND EndTime > StartTime)
  ),
  CONSTRAINT fk_training_staff       FOREIGN KEY (StaffID)       REFERENCES staff (StaffID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_training_member      FOREIGN KEY (MemberID)      REFERENCES member (MemberID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_training_reservation FOREIGN KEY (ReservationID) REFERENCES reservation (ReservationID)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE physicaltherapysession (
  TherapyID       INT          NOT NULL AUTO_INCREMENT,
  TreatmentNotes  TEXT         NULL,
  AppointmentDate DATETIME     NOT NULL,
  ReferralSource  VARCHAR(100) NULL,
  StaffID         INT          NOT NULL,
  MemberID        INT          NOT NULL,
  PRIMARY KEY (TherapyID),
  CONSTRAINT fk_therapy_staff  FOREIGN KEY (StaffID)  REFERENCES staff (StaffID)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_therapy_member FOREIGN KEY (MemberID) REFERENCES member (MemberID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE checkin (
  CheckInID   INT      NOT NULL AUTO_INCREMENT,
  CheckInTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MemberID    INT      NOT NULL,
  PRIMARY KEY (CheckInID),
  KEY idx_checkin_time (CheckInTime),
  CONSTRAINT fk_checkin_member FOREIGN KEY (MemberID) REFERENCES member (MemberID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;
