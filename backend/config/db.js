// config/db.js — MySQL connection pool
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true }
    : undefined,
  timezone: '+05:30',  // IST
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected:', process.env.DB_HOST);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
