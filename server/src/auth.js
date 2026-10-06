const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { HttpError, wrap } = require('./errors');
const { can, permissionsFor, SELF_SCOPED_ROLES } = require('./permissions');

const COOKIE_NAME = 'pp_session';
const ISSUER = 'peak-performance';

const USER_SELECT = `
  SELECT u.UserID, u.Email, u.Role, u.StaffID, u.IsActive, u.TokenVersion, u.LastLoginAt,
         s.FirstName, s.LastName
    FROM users u
    LEFT JOIN staff s ON s.StaffID = u.StaffID`;

/** The shape the API exposes for the logged-in user (never includes the hash). */
function toPublicUser(row) {
  return {
    UserID: row.UserID,
    Email: row.Email,
    Role: row.Role,
    StaffID: row.StaffID,
    DisplayName: row.FirstName ? `${row.FirstName} ${row.LastName}` : row.Email,
    permissions: permissionsFor(row.Role),
  };
}

function createAuth({ db, config }) {
  const { jwtSecret, sessionHours, bcryptRounds, cookieSecure } = config.auth;

  // Compared against when the email doesn't exist, so a login attempt takes the
  // same time whether or not the account exists (no user enumeration by timing).
  const dummyHash = bcrypt.hashSync('not-a-real-password', bcryptRounds);

  const cookieOptions = {
    httpOnly: true, // not readable from JS, so an XSS bug can't steal the session
    secure: cookieSecure,
    sameSite: 'strict', // not sent on cross-site requests (CSRF protection)
    path: '/api',
    maxAge: sessionHours * 60 * 60 * 1000,
  };

  const hashPassword = (plain) => bcrypt.hash(plain, bcryptRounds);

  async function findUserById(id) {
    const [found] = await db.query(`${USER_SELECT} WHERE u.UserID = ?`, [id]);
    return found[0] || null;
  }

  /** Returns the user row on success, null on bad credentials or inactive account. */
  async function verifyCredentials(email, password) {
    const [found] = await db.query('SELECT UserID, PasswordHash, IsActive FROM users WHERE Email = ?', [email]);
    const row = found[0];
    const ok = await bcrypt.compare(password, row ? row.PasswordHash : dummyHash);
    if (!row || !ok || !row.IsActive) return null;
    return findUserById(row.UserID);
  }

  function issueSession(res, user) {
    const token = jwt.sign({ tv: user.TokenVersion }, jwtSecret, {
      subject: String(user.UserID),
      issuer: ISSUER,
      algorithm: 'HS256',
      expiresIn: `${sessionHours}h`,
    });
    res.cookie(COOKIE_NAME, token, cookieOptions);
  }

  function clearSession(res) {
    const { maxAge, ...rest } = cookieOptions; // eslint-disable-line no-unused-vars
    res.clearCookie(COOKIE_NAME, rest);
  }

  /** Requires a valid session and sets req.user. The user is re-read every time
   *  so deactivation, role changes and password resets apply right away. */
  const authenticate = wrap(async (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Please sign in');

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
    } catch {
      clearSession(res);
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }

    const user = await findUserById(Number(payload.sub));
    if (!user || !user.IsActive || user.TokenVersion !== payload.tv) {
      clearSession(res);
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    req.user = user;
    next();
  });

  return { authenticate, verifyCredentials, issueSession, clearSession, hashPassword, findUserById };
}

/** Middleware: 403 unless the logged-in user's role has the permission. */
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  if (!can(req.user.Role, permission)) {
    return next(new HttpError(403, 'You do not have permission to do that'));
  }
  next();
};

/** Trainers/therapists may only act on rows assigned to their own staff record. */
function assertOwnsStaffRecord(user, staffId, what = 'sessions') {
  if (SELF_SCOPED_ROLES.includes(user.Role) && user.StaffID !== staffId) {
    throw new HttpError(403, `You can only manage your own ${what}`);
  }
}

module.exports = {
  createAuth,
  requirePermission,
  assertOwnsStaffRecord,
  toPublicUser,
  COOKIE_NAME,
  USER_SELECT,
};
