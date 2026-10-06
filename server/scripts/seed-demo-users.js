// Creates one demo login per role, for local demos and docker-compose.
// Development only: refuses to run when NODE_ENV=production.
//
//   DEMO_PASSWORD='something-long' npm run seed:demo-users
//
// Makes manager@, frontdesk@, trainer@ (staff 5) and therapist@ (staff 16) at demo.test,
// all sharing DEMO_PASSWORD.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');

const ACCOUNTS = [
  { Email: 'manager@demo.test', Role: 'manager', StaffID: null },
  { Email: 'frontdesk@demo.test', Role: 'front_desk', StaffID: 2 },
  { Email: 'trainer@demo.test', Role: 'trainer', StaffID: 5 },
  { Email: 'therapist@demo.test', Role: 'therapist', StaffID: 16 },
];

(async () => {
  const config = loadConfig();
  if (config.production) {
    console.error('Refusing to create demo accounts with NODE_ENV=production.');
    process.exit(1);
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) {
    console.error('Set DEMO_PASSWORD (at least 12 characters) first.');
    process.exit(1);
  }

  const pool = createPool(config.db);
  try {
    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    for (const a of ACCOUNTS) {
      // Idempotent: re-running just resets the password.
      await pool.query(
        `INSERT INTO users (Email, PasswordHash, Role, StaffID) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE PasswordHash = VALUES(PasswordHash), TokenVersion = TokenVersion + 1`,
        [a.Email, hash, a.Role, a.StaffID]
      );
      console.log(`  ${a.Email.padEnd(22)} ${a.Role}`);
    }
    console.log('Demo logins ready (password = DEMO_PASSWORD).');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
