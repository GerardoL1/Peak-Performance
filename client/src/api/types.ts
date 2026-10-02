// Shapes returned by the API. One place, shared by every page.

export type Role = 'manager' | 'front_desk' | 'trainer' | 'therapist';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type ReservationStatus = 'Booked' | 'Cancelled' | 'Attended';

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    sort: string;
    order: 'asc' | 'desc';
    statusCounts?: Partial<Record<ReservationStatus, number>>;
  };
}

export interface CurrentUser {
  UserID: number;
  Email: string;
  Role: Role;
  StaffID: number | null;
  DisplayName: string;
  permissions: string[];
}

export interface Member {
  MemberID: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone: string;
  Address: string;
  DOB: string | null;
  EmergencyContact: string | null;
  MembershipStartDate: string | null;
  PlanID: number;
  PlanName: string;
  MonthlyFee: number;
}

export interface Staff {
  StaffID: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone: string | null;
  HireDate: string | null;
  RoleID: number;
  RoleName: string;
  HasLogin: 0 | 1;
}

export interface GymClass {
  ClassID: number;
  ClassName: string;
  ClassDescription: string | null;
  DifficultyLevel: Difficulty;
  Duration: number;
}

export interface Schedule {
  ScheduleID: number;
  ClassID: number;
  StaffID: number;
  RoomID: number;
  MaxCapacity: number;
  StartDate: string;
  StartTime: string;
  EndDate: string;
  EndTime: string;
  ClassName: string;
  DifficultyLevel: Difficulty;
  StaffFirstName: string;
  StaffLastName: string;
  RoomNumber: string;
  RoomCapacity: number;
  Booked: number;
}

export interface Reservation {
  ReservationID: number;
  ReservationDate: string;
  ReservationStatus: ReservationStatus;
  ScheduleID: number;
  ClassName: string;
  StartDate: string;
  StartTime: string;
  EndTime: string;
  MemberID: number;
  MemberFirstName: string;
  MemberLastName: string;
}

export interface TrainingSession {
  TrainingID: number;
  StartDate: string;
  StartTime: string;
  EndDate: string;
  EndTime: string;
  SessionNotes: string | null;
  StaffID: number;
  MemberID: number;
  StaffFirstName: string;
  StaffLastName: string;
  MemberFirstName: string;
  MemberLastName: string;
}

export interface TherapySession {
  TherapyID: number;
  AppointmentDate: string;
  DurationMinutes: number;
  ReferralSource: string | null;
  TreatmentNotes: string | null;
  NotesHidden: boolean;
  StaffID: number;
  MemberID: number;
  StaffFirstName: string;
  StaffLastName: string;
  MemberFirstName: string;
  MemberLastName: string;
}

export interface CheckIn {
  CheckInID: number;
  CheckInTime: string;
  MemberID: number;
  FirstName: string;
  LastName: string;
  PlanName: string;
}

export interface Facility {
  FacilityID: number;
  FacilityName: string;
  FacilityType: string;
  FacilityDescription: string | null;
  RoomCount: number;
}

export interface Room {
  RoomID: number;
  RoomNumber: string;
  Capacity: number;
  FacilityID: number;
  FacilityName: string;
}

export interface Plan {
  PlanID: number;
  PlanName: string;
  MonthlyFee: number;
  BenefitsDescription: string | null;
  AccessLevel: string | null;
  MemberCount: number;
}

export interface AppUser {
  UserID: number;
  Email: string;
  Role: Role;
  StaffID: number | null;
  IsActive: 0 | 1;
  CreatedAt: string;
  LastLoginAt: string | null;
  StaffFirstName: string | null;
  StaffLastName: string | null;
}

export interface Lookups {
  plans: Pick<Plan, 'PlanID' | 'PlanName' | 'MonthlyFee'>[];
  roles: { RoleID: number; RoleName: string }[];
  classes: Pick<GymClass, 'ClassID' | 'ClassName' | 'Duration'>[];
  rooms: Pick<Room, 'RoomID' | 'RoomNumber' | 'Capacity' | 'FacilityName'>[];
  staff: { StaffID: number; FirstName: string; LastName: string; RoleName: string }[];
}

export interface Dashboard {
  today: string;
  kpis: {
    totalMembers: number;
    newMembersThisMonth: number;
    monthlyRecurringRevenue: number | null;
    checkInsToday: number;
    checkInsLast7Days: number;
    checkInsPrev7Days: number;
    classesNext7Days: number;
    trainingNext7Days: number;
  };
  checkInsByDay: { day: string; count: number }[];
  checkInsByHour: { hour: number; count: number }[];
  reservationsByStatus: { status: ReservationStatus; count: number }[];
  planMix: { PlanName: string; members: number; revenue: number | null }[];
  upcomingClasses: Pick<
    Schedule,
    | 'ScheduleID'
    | 'ClassName'
    | 'StartDate'
    | 'StartTime'
    | 'MaxCapacity'
    | 'RoomNumber'
    | 'StaffFirstName'
    | 'StaffLastName'
    | 'Booked'
  >[];
  classFill: { ClassName: string; sessions: number; avgFillPct: number; attended: number }[];
}
