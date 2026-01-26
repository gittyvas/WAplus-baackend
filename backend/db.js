const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT) || 3306,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection on startup
pool.getConnection()
  .then(connection => {
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY OVER SSL');
    connection.release();
  })
  .catch(error => {
    console.error('❌ DATABASE CONNECTION ERROR:', error.message);
    process.exit(1);
  });

module.exports = pool;
