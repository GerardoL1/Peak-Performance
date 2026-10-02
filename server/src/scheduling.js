// Double-booking checks shared by class schedules, personal training and therapy.
//
// A trainer/therapist/instructor can't be in two places at once (across all three
// kinds of booking), a room can't host two classes at once, and a member can't
// have two personal sessions at once.
//
// Intervals are half-open [start, end): a session ending at 10:00 doesn't clash
// with one starting at 10:00.

const { HttpError } = require('./errors');

const CLASS_START = 'TIMESTAMP(cs.StartDate, cs.StartTime)';
const CLASS_END = 'TIMESTAMP(cs.EndDate, cs.EndTime)';
const TRAINING_START = 'TIMESTAMP(t.StartDate, t.StartTime)';
const TRAINING_END = 'TIMESTAMP(t.EndDate, t.EndTime)';
const THERAPY_START = 'pt.AppointmentDate';
const THERAPY_END = 'pt.AppointmentDate + INTERVAL pt.DurationMinutes MINUTE';

const fmt = (date, time) => `${date} ${String(time).slice(0, 5)}`;

/**
 * Locks the staff/room/member rows involved (SELECT ... FOR UPDATE) so two
 * concurrent requests for the same person or room are serialized: the second
 * waits, then sees the first one's booking in its overlap check. Locks are always
 * taken in the same order (staff, room, member) to avoid deadlocks.
 * Must be called inside a transaction.
 */
async function lockParticipants(conn, { staffId, roomId, memberId }) {
  const lock = async (sql, id, message) => {
    if (!id) return null;
    const [found] = await conn.query(sql, [id]);
    if (!found.length) throw new HttpError(400, message);
    return found[0];
  };
  const staff = await lock(
    `SELECT s.StaffID, s.FirstName, s.LastName, r.RoleName
       FROM staff s LEFT JOIN role r ON r.RoleID = s.RoleID
      WHERE s.StaffID = ? FOR UPDATE OF s`,
    staffId,
    'Selected staff member does not exist'
  );
  const room = await lock(
    'SELECT RoomID, RoomNumber, Capacity FROM room WHERE RoomID = ? FOR UPDATE',
    roomId,
    'Selected room does not exist'
  );
  const member = await lock(
    'SELECT MemberID FROM member WHERE MemberID = ? FOR UPDATE',
    memberId,
    'Selected member does not exist'
  );
  return { staff, room, member };
}

/**
 * Returns a list of { field, message } conflicts for the proposed slot.
 * @param ignore { schedule, training, therapy } ids to exclude (the row being edited)
 */
async function findConflicts(conn, { start, end, staffId, roomId, memberId, ignore = {} }) {
  const conflicts = [];
  const window = [end, start];
  const first = async (sql, params) => (await conn.query(sql, params))[0][0];

  if (staffId) {
    const cls = await first(
      `SELECT g.ClassName, cs.StartDate, cs.StartTime FROM classschedule cs
         JOIN groupfitnessclass g ON g.ClassID = cs.ClassID
        WHERE cs.StaffID = ? AND cs.ScheduleID <> ? AND ${CLASS_START} < ? AND ${CLASS_END} > ? LIMIT 1`,
      [staffId, ignore.schedule ?? 0, ...window]
    );
    if (cls)
      conflicts.push({
        field: 'StaffID',
        message: `Already teaching ${cls.ClassName} at ${fmt(cls.StartDate, cls.StartTime)}`,
      });

    const pt = await first(
      `SELECT t.StartDate, t.StartTime FROM personaltrainingsession t
        WHERE t.StaffID = ? AND t.TrainingID <> ? AND ${TRAINING_START} < ? AND ${TRAINING_END} > ? LIMIT 1`,
      [staffId, ignore.training ?? 0, ...window]
    );
    if (pt)
      conflicts.push({
        field: 'StaffID',
        message: `Already has a training session at ${fmt(pt.StartDate, pt.StartTime)}`,
      });

    const th = await first(
      `SELECT pt.AppointmentDate FROM physicaltherapysession pt
        WHERE pt.StaffID = ? AND pt.TherapyID <> ? AND ${THERAPY_START} < ? AND ${THERAPY_END} > ? LIMIT 1`,
      [staffId, ignore.therapy ?? 0, ...window]
    );
    if (th)
      conflicts.push({
        field: 'StaffID',
        message: `Already has a therapy appointment at ${th.AppointmentDate.slice(0, 16)}`,
      });
  }

  if (roomId) {
    const cls = await first(
      `SELECT g.ClassName, cs.StartDate, cs.StartTime FROM classschedule cs
         JOIN groupfitnessclass g ON g.ClassID = cs.ClassID
        WHERE cs.RoomID = ? AND cs.ScheduleID <> ? AND ${CLASS_START} < ? AND ${CLASS_END} > ? LIMIT 1`,
      [roomId, ignore.schedule ?? 0, ...window]
    );
    if (cls)
      conflicts.push({
        field: 'RoomID',
        message: `Room is booked for ${cls.ClassName} at ${fmt(cls.StartDate, cls.StartTime)}`,
      });
  }

  if (memberId) {
    const pt = await first(
      `SELECT t.StartDate, t.StartTime FROM personaltrainingsession t
        WHERE t.MemberID = ? AND t.TrainingID <> ? AND ${TRAINING_START} < ? AND ${TRAINING_END} > ? LIMIT 1`,
      [memberId, ignore.training ?? 0, ...window]
    );
    if (pt)
      conflicts.push({
        field: 'MemberID',
        message: `Member already has a training session at ${fmt(pt.StartDate, pt.StartTime)}`,
      });

    const th = await first(
      `SELECT pt.AppointmentDate FROM physicaltherapysession pt
        WHERE pt.MemberID = ? AND pt.TherapyID <> ? AND ${THERAPY_START} < ? AND ${THERAPY_END} > ? LIMIT 1`,
      [memberId, ignore.therapy ?? 0, ...window]
    );
    if (th)
      conflicts.push({
        field: 'MemberID',
        message: `Member already has a therapy appointment at ${th.AppointmentDate.slice(0, 16)}`,
      });
  }

  return conflicts;
}

/** Locks participants, then throws 409 with field-level details if the slot clashes. */
async function assertSlotFree(conn, slot) {
  const locked = await lockParticipants(conn, slot);
  const conflicts = await findConflicts(conn, slot);
  if (conflicts.length) throw new HttpError(409, 'Scheduling conflict', conflicts);
  return locked;
}

module.exports = { assertSlotFree, findConflicts, lockParticipants };
