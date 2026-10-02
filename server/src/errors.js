class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DUPLICATE_MESSAGES = {
  uq_member_email: 'A member with that email already exists',
  uq_staff_email: 'A staff member with that email already exists',
  uq_user_email: 'A login with that email already exists',
  uq_user_staff: 'That staff member already has a login',
  uq_class_name: 'A class with that name already exists',
};

const CHECK_MESSAGES = {
  chk_schedule_times: 'End must be after start',
  chk_training_times: 'End must be after start',
  chk_schedule_capacity: 'Capacity must be greater than zero',
  chk_class_duration: 'Duration must be greater than zero',
  chk_therapy_duration: 'Duration must be between 15 and 480 minutes',
  chk_user_staff_link: 'Trainer and therapist logins must be linked to a staff member',
};

const findKey = (message, table) => Object.keys(table).find((k) => message.includes(k));

/**
 * Translate MySQL/MariaDB errors into safe client responses. We match on errno
 * (numeric) so it works on both MySQL 8 and MariaDB, and never send raw SQL text back.
 */
function mapDbError(err) {
  const msg = err.sqlMessage || '';
  switch (err.errno) {
    case 1062: {
      const key = findKey(msg, DUPLICATE_MESSAGES);
      return new HttpError(409, key ? DUPLICATE_MESSAGES[key] : 'A record with that value already exists');
    }
    // 1451/1452 are what root sees. A least-privilege user (peak_app) isn't allowed to see
    // the constraint details, so MySQL reports the same failures as 1217/1216 instead.
    case 1451: // parent row referenced by children
    case 1217:
      return new HttpError(
        409,
        'Cannot delete: other records (reservations, check-ins, sessions, logins) still reference this one'
      );
    case 1452: // child row references missing parent
    case 1216:
      return new HttpError(
        400,
        'Referenced record does not exist (check the selected plan, member, staff, room, etc.)'
      );
    case 3819: // MySQL CHECK violated
    case 4025: {
      // MariaDB CHECK violated
      const key = findKey(msg, CHECK_MESSAGES);
      return new HttpError(
        400,
        key ? CHECK_MESSAGES[key] : 'Value violates a data rule (check dates, capacity and fee values)'
      );
    }
    case 1265: // data truncated (bad ENUM etc.)
    case 1292: // incorrect date/time value
    case 1366: // incorrect value for column
    case 1406: // data too long
      return new HttpError(400, 'One or more values are invalid');
    default:
      break;
  }
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code) || err.errno === 1045) {
    return new HttpError(503, 'Database unavailable');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let httpErr = err instanceof HttpError ? err : null;
  if (!httpErr && err.type === 'entity.parse.failed') httpErr = new HttpError(400, 'Request body is not valid JSON');
  if (!httpErr && err.type === 'entity.too.large') httpErr = new HttpError(413, 'Request body too large');
  if (!httpErr) httpErr = mapDbError(err);

  if (httpErr) {
    if (httpErr.status >= 500) console.error(`${req.method} ${req.originalUrl}:`, err.message);
    const body = { error: httpErr.message };
    if (httpErr.details) body.details = httpErr.details;
    return res.status(httpErr.status).json(body);
  }

  // Unknown failure: log everything server-side, tell the client nothing useful.
  console.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, wrap, mapDbError, errorHandler };
