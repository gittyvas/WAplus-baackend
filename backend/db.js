// backend/db.js

const mysql = require('mysql2/promise'); // Using the promise-based API for async/await

// Function to create a database connection pool
async function createPool() {
  // Ensure environment variables are set for database connection
  // These are critical for production deployments like Render
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_DATABASE) {
    console.error('CRITICAL ERROR: One or more database environment variables (DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE) are not set!');
    // In a production environment, it's safer to exit if essential configuration is missing
    process.exit(1);
  }

  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true, // If true, the pool will queue connections if none are available
      connectionLimit: 10,       // Maximum number of connections to create at once
      queueLimit: 0              // No limit for the connection queue (connections will queue indefinitely)
    });

    // Test the connection by getting and releasing a connection
    const connection = await pool.getConnection();
    console.log('Successfully connected to the database and created pool.');
    connection.release(); // Release the connection back to the pool

    return pool;
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to create database pool or connect:', error.message);
    // Log the full error stack for debugging in production logs
    console.error(error.stack);
    process.exit(1); // Exit if pool creation or initial connection fails
  }
}

// Export the function to create the pool
module.exports = createPool;
