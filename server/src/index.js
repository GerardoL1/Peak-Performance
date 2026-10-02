require('dotenv').config();
const { loadConfig } = require('./config');
const { createPool } = require('./db');
const { createApp } = require('./app');

async function start() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`Configuration error: ${err.message}`);
    process.exit(1);
  }

  const pool = createPool(config.db);
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Unable to connect to MySQL. Check the DB_* values in .env:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const app = createApp({ db: pool, config });
  const { host, port } = config.server;
  const server = app.listen(port, host, () => {
    console.log(`API listening on http://${host}:${port}`);
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
