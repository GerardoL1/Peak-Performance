// Creates a login. Used to bootstrap the first manager (after that, managers can
// create logins from the Users page).
//
//   npm run user:create -- --email you@example.com --role manager
//   npm run user:create -- --email trainer@example.com --role trainer --staff-id 5
//
// The password is typed at a hidden prompt, or read from NEW_USER_PASSWORD for
// non-interactive use (CI, docker). It is never accepted as a command-line
// argument, because those end up in shell history and process listings.

require('dotenv').config();
const readline = require('node:readline');
const { parseArgs } = require('node:util');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');
const { validate, userCreateSchema } = require('../src/validation');

/**
 * Asks the questions one after another on a single readline interface, echoing
 * "*" instead of the typed characters. (Opening a second interface after closing
 * the first is unreliable on Windows terminals.)
 */
async function promptHidden(questions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  let current = '';
  rl._writeToOutput = (s) => {
    if (!muted) rl.output.write(s);
    else if (/^[\r\n]+$/.test(s)) rl.output.write('\n');
    // After Backspace etc. readline redraws "question + typed text" in one write:
    // keep the question visible and mask only the typed part.
    else if (s.startsWith(current)) rl.output.write(current + '*'.repeat(rl.line.length));
    else rl.output.write('*'.repeat(s.length));
  };
  const ask = (q) =>
    new Promise((resolve) => {
      current = q;
      muted = false;
      rl.question(q, (answer) => resolve(answer.replace(/\r$/, '')));
      muted = true;
    });
  const answers = [];
  for (const q of questions) answers.push(await ask(q));
  muted = false;
  rl.close();
  return answers;
}

(async () => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      role: { type: 'string' },
      'staff-id': { type: 'string' },
    },
  });

  let password = process.env.NEW_USER_PASSWORD;
  for (let attempt = 1; !password && attempt <= 3; attempt += 1) {
    const [first, again] = await promptHidden(['Password (min 12 characters): ', 'Repeat password: ']);
    if (first === again) password = first;
    else console.error(attempt < 3 ? 'Passwords do not match, try again.' : 'Passwords do not match.');
  }
  if (!password) process.exit(1);

  let d;
  try {
    d = validate(userCreateSchema, {
      Email: values.email,
      Password: password,
      Role: values.role,
      StaffID: values['staff-id'] ?? null,
    });
  } catch (err) {
    console.error('Invalid input:');
    for (const x of err.details ?? []) console.error(`  ${x.field}: ${x.message}`);
    console.error(
      '\nUsage: npm run user:create -- --email you@example.com --role manager|front_desk|trainer|therapist [--staff-id N]'
    );
    process.exit(1);
  }

  const config = loadConfig();
  const pool = createPool(config.db);
  try {
    const hash = await bcrypt.hash(d.Password, config.auth.bcryptRounds);
    const [result] = await pool.query('INSERT INTO users (Email, PasswordHash, Role, StaffID) VALUES (?, ?, ?, ?)', [
      d.Email,
      hash,
      d.Role,
      d.StaffID,
    ]);
    console.log(`Created ${d.Role} login #${result.insertId} for ${d.Email}`);
  } catch (err) {
    if (err.errno === 1062) console.error('A login with that email (or for that staff member) already exists.');
    else if (err.errno === 1452) console.error('No staff member with that --staff-id.');
    else console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
