const mysql = require('mysql2/promise');

async function createPool() {
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
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined, 
      // If DB_SSL=false, ssl is undefined and connection will be plain
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
