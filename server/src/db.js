const mysql = require('mysql2/promise');

function createPool(dbConfig, overrides = {}) {
  return mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    // DATE/TIME/DATETIME come back as plain 'YYYY-MM-DD' / 'HH:MM:SS' strings instead of
    // JS Date objects, which JSON-serialize to UTC ISO timestamps and can shift the day.
    dateStrings: true,
    // DECIMAL(10,2) comes back as a number (29.99) instead of the string '29.99'.
    decimalNumbers: true,
    ...overrides,
  });
}

/** Runs fn(conn) inside a transaction; commits on success, rolls back on any error. */
async function withTransaction(db, fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Shorthand for queries where only the rows matter. */
async function rows(db, sql, params) {
  const [result] = await db.query(sql, params);
  return result;
}

module.exports = { createPool, withTransaction, rows };
