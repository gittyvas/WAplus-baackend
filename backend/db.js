const mysql = require('mysql2/promise');

async function createPool() {
  // Debug: Print the DB_SSL value to the logs (safely)
  console.log(`Debug: DB_SSL value is "${process.env.DB_SSL}"`);

  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_DATABASE) {
    console.error('CRITICAL ERROR: Missing database environment variables!');
    process.exit(1);
  }

  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // FIX: Force SSL object if DB_SSL is set, handling whitespace issues
      ssl: { rejectUnauthorized: false }
    });

    const connection = await pool.getConnection();
    console.log('Successfully connected to the database and created pool.');
    connection.release();

    return pool;
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to create database pool or connect:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = createPool;
