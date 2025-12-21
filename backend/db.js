const mysql = require('mysql2/promise');

async function createPool() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;
  const port = process.env.DB_PORT || 3306;

  console.log(`Attempting secure connection to: ${host}`);

  try {
    const pool = mysql.createPool({
      host: host,
      user: user,
      password: password,
      database: database,
      port: parseInt(port),
      // This configuration is specifically for "require_secure_transport=ON"
      ssl: {
        rejectUnauthorized: false
      },
      // Adding these help with cloud connection stability
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test the connection immediately
    const connection = await pool.getConnection();
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY OVER SSL');
    connection.release();

    return pool;
  } catch (error) {
    console.error('❌ DATABASE CONNECTION ERROR:', error.message);
    process.exit(1);
  }
}

module.exports = createPool;
