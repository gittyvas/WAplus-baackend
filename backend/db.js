const mysql = require('mysql2/promise');

async function createPool() {
  // 1. Check for missing variables
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_DATABASE) {
    console.error('CRITICAL ERROR: Missing database environment variables!');
    console.log('Current Env:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        db: process.env.DB_DATABASE,
        ssl_env: process.env.DB_SSL // Log what Northflank is actually sending
    });
    process.exit(1);
  }

  // 2. Create the config object explicitly
  const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // 3. FORCE SSL: We do not check process.env.DB_SSL here. 
    // We hardcode it because your specific error says it is REQUIRED.
    ssl: {
      rejectUnauthorized: false
    }
  };

  try {
    // Log the config (Masking password for security)
    const logConfig = { ...dbConfig, password: '*****' };
    console.log('Attempting to connect with config:', JSON.stringify(logConfig, null, 2));

    const pool = mysql.createPool(dbConfig);

    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to the database!');
    connection.release();

    return pool;
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to connect to database.');
    console.error('Error Message:', error.message);
    process.exit(1);
  }
}

module.exports = createPool;
