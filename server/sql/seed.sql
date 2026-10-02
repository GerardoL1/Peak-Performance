-- seed.sql — sample data for development/demo only (fictional people).
-- Run AFTER schema.sql, on an empty database.

USE peakperformance;
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO role (RoleID, RoleName, RoleDescription) VALUES
  (1, 'General Manager', 'Oversees all gym operations and staff'),
  (2, 'Front Desk Associate', 'Manages member check-ins and inquiries'),
  (3, 'Personal Trainer', 'Provides one-on-one training sessions to members'),
  (4, 'Group Fitness Instructor', 'Leads group fitness classes'),
  (5, 'Physical Therapist', 'Provides physical therapy sessions to members');

INSERT INTO membershipplan (PlanID, PlanName, MonthlyFee, BenefitsDescription, AccessLevel) VALUES
  (1, 'Basic', 29.99, 'Access to cardio and strength floors only', 'Standard'),
  (2, 'Silver', 49.99, 'Access to all floors and one guest pass per month', 'Intermediate'),
  (3, 'Gold', 69.99, 'Access to all floors, unlimited guest passes, and group classes', 'Premium'),
  (4, 'Platinum', 89.99, 'Full access to all facilities including physical therapy', 'Elite'),
  (5, 'Student', 19.99, 'Discounted access to cardio and strength floors only', 'Standard');

INSERT INTO facility (FacilityID, FacilityName, FacilityType, FacilityDescription) VALUES
  (1, 'Cardio Floor', 'Exercise Area', 'Large open floor with cardio machines and equipment'),
  (2, 'Strength Floor', 'Exercise Area', 'Free weights, machines, and strength training equipment'),
  (3, 'Group Fitness Studio', 'Studio', 'Open studio space for group fitness classes'),
  (4, 'Physical Therapy Suite', 'Therapy', 'Private suites for physical therapy appointments');

INSERT INTO room (RoomID, RoomNumber, Capacity, FacilityID) VALUES
  (1, '101', 50, 1),
  (2, '102', 50, 1),
  (3, '201', 60, 2),
  (4, '202', 60, 2),
  (5, '301', 30, 3),
  (6, '302', 25, 3),
  (7, '303', 20, 3),
  (8, '401', 10, 4),
  (9, '402', 10, 4),
  (10, '403', 8, 4);

INSERT INTO groupfitnessclass (ClassID, ClassName, ClassDescription, DifficultyLevel, Duration) VALUES
  (1, 'Yoga', 'A relaxing class focused on flexibility and mindfulness', 'Beginner', 60),
  (2, 'Spin', 'High energy indoor cycling class', 'Intermediate', 45),
  (3, 'HIIT', 'High intensity interval training for maximum calorie burn', 'Advanced', 45),
  (4, 'Pilates', 'Core strengthening and body conditioning class', 'Beginner', 60),
  (5, 'Zumba', 'Dance fitness class with Latin inspired music', 'Beginner', 60),
  (6, 'Boxing Fitness', 'Cardio boxing class for strength and endurance', 'Intermediate', 45),
  (7, 'Barre', 'Ballet inspired toning and strengthening class', 'Intermediate', 60),
  (8, 'Boot Camp', 'Military style full body workout class', 'Advanced', 60);

INSERT INTO staff (StaffID, FirstName, LastName, Email, Phone, HireDate, RoleID) VALUES
  (1, 'Michael', 'Johnson', 'mjohnson@peakperformance.com', '972-555-0101', '2019-03-15', 1),
  (2, 'Sarah', 'Williams', 'swilliams@peakperformance.com', '972-555-0102', '2020-06-01', 2),
  (3, 'David', 'Martinez', 'dmartinez@peakperformance.com', '972-555-0103', '2020-08-15', 2),
  (4, 'Emily', 'Davis', 'edavis@peakperformance.com', '972-555-0104', '2021-01-10', 2),
  (5, 'James', 'Wilson', 'jwilson@peakperformance.com', '972-555-0105', '2020-05-20', 3),
  (6, 'Ashley', 'Brown', 'abrown@peakperformance.com', '972-555-0106', '2021-03-01', 3),
  (7, 'Chris', 'Taylor', 'ctaylor@peakperformance.com', '972-555-0107', '2021-07-15', 3),
  (8, 'Jessica', 'Anderson', 'janderson@peakperformance.com', '972-555-0108', '2022-01-20', 3),
  (9, 'Ryan', 'Thomas', 'rthomas@peakperformance.com', '972-555-0109', '2022-04-10', 3),
  (10, 'Megan', 'Jackson', 'mjackson@peakperformance.com', '972-555-0110', '2022-09-01', 3),
  (11, 'Kevin', 'White', 'kwhite@peakperformance.com', '972-555-0111', '2021-05-15', 4),
  (12, 'Lauren', 'Harris', 'lharris@peakperformance.com', '972-555-0112', '2021-08-20', 4),
  (13, 'Brian', 'Clark', 'bclark@peakperformance.com', '972-555-0113', '2022-02-10', 4),
  (14, 'Amanda', 'Lewis', 'alewis@peakperformance.com', '972-555-0114', '2022-06-01', 4),
  (15, 'Daniel', 'Robinson', 'drobinson@peakperformance.com', '972-555-0115', '2022-11-15', 4),
  (16, 'Nicole', 'Walker', 'nwalker@peakperformance.com', '972-555-0116', '2021-04-01', 5),
  (17, 'Jason', 'Hall', 'jhall@peakperformance.com', '972-555-0117', '2021-10-15', 5);

INSERT INTO member (MemberID, FirstName, LastName, Email, Phone, Address, DOB, EmergencyContact, MembershipStartDate, PlanID) VALUES
  (1, 'John', 'Smith', 'jsmith@email.com', '972-555-9999', '123 Main St Dallas TX', '1990-05-15', 'Jane Smith 972-555-2001', '2022-01-10', 1),
  (2, 'Maria', 'Lopez', 'mlopez@email.com', '972-555-1002', '456 Oak Ave Dallas TX', '1985-08-22', 'Carlos Lopez 972-555-2002', '2022-03-15', 2),
  (3, 'Tyler', 'Brown', 'tbrown@email.com', '972-555-1003', '789 Pine Rd Dallas TX', '1995-11-30', 'Susan Brown 972-555-2003', '2022-05-20', 3),
  (4, 'Aisha', 'Johnson', 'ajohnson@email.com', '972-555-1004', '321 Elm St Dallas TX', '1992-02-14', 'Marcus Johnson 972-555-2004', '2022-07-01', 4),
  (5, 'Kevin', 'Lee', 'klee@email.com', '972-555-1005', '654 Maple Dr Dallas TX', '1998-09-08', 'Linda Lee 972-555-2005', '2022-09-15', 5),
  (6, 'Samantha', 'Davis', 'sdavis@email.com', '972-555-1006', '987 Cedar Ln Dallas TX', '1988-04-25', 'Robert Davis 972-555-2006', '2023-01-05', 1),
  (7, 'Marcus', 'Wilson', 'mwilson@email.com', '972-555-1007', '147 Birch Blvd Dallas TX', '1993-07-19', 'Diana Wilson 972-555-2007', '2023-03-10', 2),
  (8, 'Rachel', 'Taylor', 'rtaylor@email.com', '972-555-1008', '258 Walnut St Dallas TX', '1997-12-03', 'Paul Taylor 972-555-2008', '2023-05-22', 3),
  (9, 'James', 'Anderson', 'janderson@email.com', '972-555-1009', '369 Spruce Ave Dallas TX', '1991-03-11', 'Helen Anderson 972-555-2009', '2023-07-14', 4),
  (10, 'Emily', 'Thomas', 'ethomas@email.com', '972-555-1010', '741 Poplar Rd Dallas TX', '1996-06-28', 'George Thomas 972-555-2010', '2023-09-01', 5);

INSERT INTO classschedule (ScheduleID, MaxCapacity, StartDate, StartTime, EndDate, EndTime, ClassID, StaffID, RoomID) VALUES
  (1, 25, '2024-01-08', '06:00:00', '2024-01-08', '07:00:00', 1, 11, 5),
  (2, 25, '2024-01-08', '09:00:00', '2024-01-08', '09:45:00', 2, 12, 6),
  (3, 20, '2024-01-08', '11:00:00', '2024-01-08', '11:45:00', 3, 13, 7),
  (4, 25, '2024-01-09', '07:00:00', '2024-01-09', '08:00:00', 4, 14, 5),
  (5, 25, '2024-01-09', '10:00:00', '2024-01-09', '11:00:00', 5, 15, 6),
  (6, 20, '2024-01-10', '06:00:00', '2024-01-10', '07:00:00', 1, 11, 5),
  (7, 25, '2024-01-10', '09:00:00', '2024-01-10', '09:45:00', 2, 12, 6),
  (8, 20, '2024-01-10', '11:00:00', '2024-01-10', '11:45:00', 3, 13, 7),
  (9, 25, '2024-01-11', '07:00:00', '2024-01-11', '08:00:00', 6, 14, 5),
  (10, 25, '2024-01-11', '10:00:00', '2024-01-11', '11:00:00', 7, 15, 6);

INSERT INTO reservation (ReservationID, ReservationDate, ReservationStatus, ScheduleID, MemberID) VALUES
  (1, '2024-01-07', 'Booked', 1, 1),
  (2, '2024-01-07', 'Booked', 1, 2),
  (3, '2024-01-07', 'Attended', 2, 3),
  (4, '2024-01-07', 'Cancelled', 3, 4),
  (5, '2024-01-08', 'Attended', 4, 5),
  (6, '2024-01-08', 'Booked', 5, 6),
  (7, '2024-01-08', 'Attended', 6, 7),
  (8, '2024-01-09', 'Booked', 7, 8),
  (9, '2024-01-09', 'Cancelled', 8, 9),
  (10, '2024-01-09', 'Attended', 9, 10);

INSERT INTO personaltrainingsession (TrainingID, StartDate, StartTime, EndDate, EndTime, SessionNotes, StaffID, MemberID) VALUES
  (1, '2024-01-08', '08:00:00', '2024-01-08', '09:00:00', 'Focus on upper body strength', 5, 1),
  (2, '2024-01-08', '10:00:00', '2024-01-08', '11:00:00', 'Cardio and core training', 6, 2),
  (3, '2024-01-09', '08:00:00', '2024-01-09', '09:00:00', 'Lower body and flexibility', 7, 3),
  (4, '2024-01-09', '11:00:00', '2024-01-09', '12:00:00', 'Full body workout', 8, 4),
  (5, '2024-01-10', '08:00:00', '2024-01-10', '09:00:00', 'Endurance and stamina training', 9, 5),
  (6, '2024-01-10', '10:00:00', '2024-01-10', '11:00:00', 'Weight loss focused session', 10, 6),
  (7, '2024-01-11', '08:00:00', '2024-01-11', '09:00:00', 'Strength and conditioning', 5, 7),
  (8, '2024-01-11', '10:00:00', '2024-01-11', '11:00:00', 'Core and balance training', 6, 8),
  (9, '2024-01-12', '08:00:00', '2024-01-12', '09:00:00', 'Injury prevention exercises', 7, 9),
  (10, '2024-01-12', '10:00:00', '2024-01-12', '11:00:00', 'Athletic performance training', 8, 10);

INSERT INTO physicaltherapysession (TherapyID, TreatmentNotes, AppointmentDate, ReferralSource, StaffID, MemberID) VALUES
  (1, 'Treatment for lower back pain', '2024-01-08 09:00:00', 'Primary Care Physician', 16, 1),
  (2, 'Knee rehabilitation exercises', '2024-01-08 11:00:00', 'Orthopedic Specialist', 17, 2),
  (3, 'Shoulder injury recovery', '2024-01-09 09:00:00', 'Primary Care Physician', 16, 3),
  (4, 'Post surgery rehabilitation', '2024-01-09 11:00:00', 'Orthopedic Specialist', 17, 4),
  (5, 'Hip flexor treatment', '2024-01-10 09:00:00', 'Primary Care Physician', 16, 5),
  (6, 'Ankle sprain recovery', '2024-01-10 11:00:00', 'Sports Medicine Doctor', 17, 6),
  (7, 'Neck and upper back treatment', '2024-01-11 09:00:00', 'Primary Care Physician', 16, 7),
  (8, 'Rotator cuff rehabilitation', '2024-01-11 11:00:00', 'Orthopedic Specialist', 17, 8),
  (9, 'Hamstring strain recovery', '2024-01-12 09:00:00', 'Sports Medicine Doctor', 16, 9),
  (10, 'Wrist injury treatment', '2024-01-12 11:00:00', 'Primary Care Physician', 17, 10);

INSERT INTO checkin (CheckInID, CheckInTime, MemberID) VALUES
  (1, '2024-01-08 06:00:00', 1),
  (2, '2024-01-08 09:00:00', 2),
  (3, '2024-01-08 11:00:00', 3),
  (4, '2024-01-09 07:00:00', 4),
  (5, '2024-01-09 10:00:00', 5),
  (6, '2024-01-10 06:00:00', 6),
  (7, '2024-01-10 09:00:00', 7),
  (8, '2024-01-11 07:00:00', 8),
  (9, '2024-01-11 10:00:00', 9);

SET FOREIGN_KEY_CHECKS = 1;
