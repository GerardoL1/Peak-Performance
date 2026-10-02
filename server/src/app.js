const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { HttpError, errorHandler } = require('./errors');
const { createAuth } = require('./auth');

/**
 * Builds the Express app. The database and config are passed in (instead of
 * being imported) so tests can create an app against a test database.
 */
function createApp({ db, config }) {
  const auth = createAuth({ db, config });
  const ctx = { db, config, auth };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);
  // "simple" = querystring module: ?a[b]=1 stays a string instead of becoming an object.
  app.set('query parser', 'simple');

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Defence in depth on top of SameSite=Strict cookies: reject state-changing
  // requests whose Origin header names a site we don't serve.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && !config.corsOrigins.includes(origin)) {
      return next(new HttpError(403, 'Cross-site request blocked'));
    }
    next();
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please slow down' },
    })
  );

  // ── Public ────────────────────────────────────────────────────────────────
  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });
  app.use('/api/auth', require('./routes/auth')(ctx));

  // ── Everything below requires a signed-in user ────────────────────────────
  app.use('/api', auth.authenticate);
  app.use('/api/dashboard', require('./routes/dashboard')(ctx));
  app.use('/api/members', require('./routes/members')(ctx));
  app.use('/api/staff', require('./routes/staff')(ctx));
  app.use('/api/users', require('./routes/users')(ctx));
  app.use('/api/classes', require('./routes/classes')(ctx));
  app.use('/api/schedules', require('./routes/schedules')(ctx));
  app.use('/api/reservations', require('./routes/reservations')(ctx));
  app.use('/api/training', require('./routes/training')(ctx));
  app.use('/api/therapy', require('./routes/therapy')(ctx));
  app.use('/api/checkins', require('./routes/checkins')(ctx));
  app.use('/api', require('./routes/catalog')(ctx));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
