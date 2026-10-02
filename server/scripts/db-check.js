// Quick connectivity + schema check: npm run db:check
require('dotenv').config();
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');

(async () => {
  const pool = createPool(loadConfig().db);
  try {
    const [[row]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
    console.log(`Connected to '${row.db}' (MySQL ${row.version})`);

    const [tables] = await pool.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
    );
    const names = new Set(tables.map((t) => t.name.toLowerCase()));
    if (!names.has('users')) {
      console.warn('Table "users" is missing: run sql/002_auth_and_scheduling.sql (as root) before starting the API.');
      process.exitCode = 1;
    } else {
      const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE Role = 'manager' AND IsActive = 1");
      if (n === 0)
        console.warn(
          'No active manager login yet. Create one with: npm run user:create -- --email you@example.com --role manager'
        );
      else console.log(`Schema OK, ${n} active manager login(s).`);
    }
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
