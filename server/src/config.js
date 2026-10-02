// Reads and validates configuration once, at startup. Everything else receives
// the resulting object, which keeps process.env out of the app and lets tests
// build an app with their own settings.

function int(env, key, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function bool(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(raw).toLowerCase());
}

function loadConfig(env = process.env) {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters (see .env.example for how to generate one)');
  }

  const production = env.NODE_ENV === 'production';

  return {
    production,
    db: {
      host: env.DB_HOST,
      port: int(env, 'DB_PORT', 3306, { min: 1, max: 65535 }),
      user: env.DB_USER,
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME,
    },
    server: {
      host: env.SERVER_HOST || '127.0.0.1',
      port: int(env, 'SERVER_PORT', 5000, { min: 1, max: 65535 }),
      // Number of reverse proxies in front of the API (nginx in docker-compose = 1).
      // Needed so rate limiting sees the real client IP instead of the proxy's.
      trustProxy: int(env, 'TRUST_PROXY', 0, { min: 0, max: 10 }),
    },
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitMax: int(env, 'RATE_LIMIT_MAX', 600, { min: 1 }),
    loginRateLimitMax: int(env, 'LOGIN_RATE_LIMIT_MAX', 10, { min: 1 }),
    auth: {
      jwtSecret: env.JWT_SECRET,
      sessionHours: int(env, 'SESSION_HOURS', 10, { min: 1, max: 24 * 7 }),
      bcryptRounds: int(env, 'BCRYPT_ROUNDS', 12, { min: 4, max: 15 }),
      // Secure cookies are only sent over HTTPS; default on in production.
      cookieSecure: bool(env, 'COOKIE_SECURE', production),
    },
  };
}

module.exports = { loadConfig };
