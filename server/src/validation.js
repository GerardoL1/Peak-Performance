const { z } = require('zod');
const { HttpError } = require('./errors');

// ── Helpers ──────────────────────────────────────────────────────────────────

function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'Validation failed', details);
  }
  return result.data;
}

function parseId(value) {
  if (!/^\d{1,10}$/.test(String(value)) || Number(value) < 1 || Number(value) > 2147483647) {
    throw new HttpError(400, 'Invalid id');
  }
  return Number(value);
}

const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

const localIsoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:MM:SS' + minutes, done in UTC so DST never shifts the result. */
function addMinutes(dateTime, minutes) {
  const d = new Date(`${dateTime.replace(' ', 'T')}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ── Primitives ───────────────────────────────────────────────────────────────

/** Says "Required" when the field is missing, otherwise the given message. */
const typeError = (message) => ({ error: (issue) => (issue.input === undefined ? 'Required' : message) });

const reqText = (max) =>
  z.string(typeError('Must be text')).trim().min(1, 'Required').max(max, `Max ${max} characters`);
const optText = (max) =>
  z
    .preprocess(emptyToNull, z.string({ error: 'Must be text' }).trim().max(max, `Max ${max} characters`).nullish())
    .transform((v) => v ?? null);

const isRealDate = (s) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s.slice(0, 10));
};

const isoDate = z
  .string(typeError('Use YYYY-MM-DD'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isRealDate, 'Not a real date');
const optDate = z.preprocess(emptyToNull, isoDate.nullish()).transform((v) => v ?? null);

/** Accepts HH:MM or HH:MM:SS, returns HH:MM:SS. */
const time = z
  .string(typeError('Use HH:MM'))
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM')
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

/** Accepts 'YYYY-MM-DD HH:MM[:SS]' or the browser's datetime-local 'YYYY-MM-DDTHH:MM'. */
const dateTime = z
  .string(typeError('Use YYYY-MM-DD HH:MM'))
  .regex(/^\d{4}-\d{2}-\d{2}[T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use YYYY-MM-DD HH:MM')
  .refine(isRealDate, 'Not a real date')
  .transform((s) => {
    const v = s.replace('T', ' ');
    return v.length === 16 ? `${v}:00` : v;
  });

/** Integer field that accepts numbers or numeric strings (form and query values). */
const toNumber = (v) => {
  if (v === '' || v === null) return undefined;
  return typeof v === 'string' ? Number(v) : v;
};
const int = ({ min = 1, max = 2147483647 } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number(typeError('Must be a number'))
      .int('Must be a whole number')
      .min(min, min === 1 ? 'Must be positive' : `Min ${min}`)
      .max(max, `Max ${max}`)
  );
const posInt = int();
const optId = int().optional();
const email = z
  .string(typeError('Must be text'))
  .trim()
  .toLowerCase()
  .email('Invalid email')
  .max(100, 'Max 100 characters');

/** Adds an "end must be after start" rule to a schema with Start/End date+time fields. */
const endAfterStart = (schema) =>
  schema.refine((d) => `${d.EndDate} ${d.EndTime}` > `${d.StartDate} ${d.StartTime}`, {
    message: 'End must be after start',
    path: ['EndTime'],
  });

// ── Entity schemas ───────────────────────────────────────────────────────────

const memberSchema = z.object({
  FirstName: reqText(50),
  LastName: reqText(50),
  Email: email,
  Phone: reqText(20),
  Address: reqText(255),
  DOB: optDate.refine((d) => d === null || d <= localIsoToday(), 'Birthday cannot be in the future'),
  EmergencyContact: optText(100),
  MembershipStartDate: optDate,
  PlanID: posInt,
});

const staffSchema = z.object({
  FirstName: reqText(50),
  LastName: reqText(50),
  Email: email,
  Phone: optText(20),
  HireDate: optDate,
  RoleID: posInt,
});

const classSchema = z.object({
  ClassName: reqText(50),
  ClassDescription: optText(255),
  DifficultyLevel: z.enum(['Beginner', 'Intermediate', 'Advanced'], {
    error: 'Choose Beginner, Intermediate or Advanced',
  }),
  Duration: int({ max: 600 }),
});

const scheduleSchema = endAfterStart(
  z.object({
    ClassID: posInt,
    StaffID: posInt,
    RoomID: posInt,
    MaxCapacity: int({ max: 1000 }),
    StartDate: isoDate,
    StartTime: time,
    EndDate: isoDate,
    EndTime: time,
  })
);

const trainingSchema = endAfterStart(
  z.object({
    StaffID: posInt,
    MemberID: posInt,
    StartDate: isoDate,
    StartTime: time,
    EndDate: isoDate,
    EndTime: time,
    SessionNotes: optText(2000),
  })
);

const therapySchema = z.object({
  StaffID: posInt,
  MemberID: posInt,
  AppointmentDate: dateTime,
  DurationMinutes: z.preprocess(emptyToUndefined, int({ min: 15, max: 480 }).default(60)),
  ReferralSource: optText(100),
  TreatmentNotes: optText(5000),
});

const reservationCreateSchema = z.object({ ScheduleID: posInt, MemberID: posInt });
const reservationStatusSchema = z.object({
  ReservationStatus: z.enum(['Cancelled', 'Attended'], { error: 'Must be Cancelled or Attended' }),
});
const checkInSchema = z.object({ MemberID: posInt });

// ── Auth / users ─────────────────────────────────────────────────────────────

const ROLES = ['manager', 'front_desk', 'trainer', 'therapist'];
// bcrypt only reads the first 72 bytes of a password, so reject longer ones
// instead of silently ignoring the rest.
const password = z
  .string(typeError('Must be text'))
  .min(12, 'Use at least 12 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Max 72 bytes');
const needsStaff = (role) => role === 'trainer' || role === 'therapist';

const loginSchema = z.object({
  Email: email,
  Password: z.string(typeError('Must be text')).min(1, 'Required').max(200),
});

const userCreateSchema = z
  .object({
    Email: email,
    Password: password,
    Role: z.enum(ROLES, { error: 'Choose a role' }),
    StaffID: z.preprocess(emptyToNull, posInt.nullish()).transform((v) => v ?? null),
  })
  .refine((d) => !needsStaff(d.Role) || d.StaffID !== null, {
    message: 'Trainer and therapist logins must be linked to a staff member',
    path: ['StaffID'],
  });

const userUpdateSchema = z
  .object({
    Role: z.enum(ROLES, { error: 'Choose a role' }).optional(),
    // undefined = leave as is, null or '' = unlink
    StaffID: z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), posInt]).optional()),
    IsActive: z.boolean().optional(),
    Password: password.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Nothing to update');

module.exports = {
  z,
  validate,
  parseId,
  addMinutes,
  optId,
  isoDate,
  posInt,
  int,
  emptyToUndefined,
  memberSchema,
  staffSchema,
  classSchema,
  scheduleSchema,
  trainingSchema,
  therapySchema,
  reservationCreateSchema,
  reservationStatusSchema,
  checkInSchema,
  loginSchema,
  userCreateSchema,
  userUpdateSchema,
  ROLES,
  needsStaff,
};
