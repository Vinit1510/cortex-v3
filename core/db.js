/**
 * CORTEX V3 — Database Connection & Setup
 * Auto-creates tables on first run. Uses DATABASE_URL from environment.
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Predictions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        game_type VARCHAR(3),
        date_ist VARCHAR(10),
        time_ist VARCHAR(8),
        hour_ist VARCHAR(2),
        period_id VARCHAR(30),
        actual_num INTEGER,
        actual_size VARCHAR(5),
        actual_color VARCHAR(15),
        pred_num INTEGER,
        pred_size VARCHAR(5),
        pred_color VARCHAR(15),
        pattern_used VARCHAR(50),
        num_win VARCHAR(4),
        size_win VARCHAR(4),
        color_win VARCHAR(4),
        confidence INTEGER DEFAULT 0,
        source VARCHAR(15),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Method weights table (persisted across restarts!)
    await client.query(`
      CREATE TABLE IF NOT EXISTS method_weights (
        method VARCHAR(50) PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Random Generator predictions table (for scientific benchmark comparison)
    await client.query(`
      CREATE TABLE IF NOT EXISTS rand_predictions (
        id SERIAL PRIMARY KEY,
        game_type VARCHAR(3) NOT NULL,
        period_id VARCHAR(30) NOT NULL,
        rand_num INTEGER NOT NULL,
        rand_size VARCHAR(5) NOT NULL,
        rand_color VARCHAR(15) NOT NULL,
        actual_num INTEGER,
        actual_size VARCHAR(5),
        actual_color VARCHAR(15),
        size_win VARCHAR(4) DEFAULT 'PENDING',
        num_win VARCHAR(4) DEFAULT 'PENDING',
        color_win VARCHAR(4) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(game_type, period_id)
      )
    `);

    console.log("[DB] Tables ready ✅");
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
