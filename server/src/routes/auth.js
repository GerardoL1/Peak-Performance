const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError, wrap } = require('../errors');
const { validate, loginSchema } = require('../validation');
const { toPublicUser } = require('../auth');

module.exports = function authRoutes({ db, auth, config }) {
  const router = express.Router();

  // Brute-force protection: failed logins per IP. Successful logins don't count.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimitMax,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
  });

  router.post(
    '/login',
    loginLimiter,
    wrap(async (req, res) => {
      const { Email, Password } = validate(loginSchema, req.body);
      const user = await auth.verifyCredentials(Email, Password);
      // Same message for "no such user", "wrong password" and "deactivated".
      if (!user) throw new HttpError(401, 'Invalid email or password');

      await db.query('UPDATE users SET LastLoginAt = NOW() WHERE UserID = ?', [user.UserID]);
      auth.issueSession(res, user);
      res.json(toPublicUser(user));
    })
  );

  router.post('/logout', (req, res) => {
    auth.clearSession(res);
    res.status(204).end();
  });

  router.get('/me', auth.authenticate, (req, res) => {
    res.json(toPublicUser(req.user));
  });

  return router;
};
