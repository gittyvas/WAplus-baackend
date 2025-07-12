// backend/app.js

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const jwt = require('jsonwebtoken'); // For JWT operations

// NEW: Require the database connection module
const createDbPool = require("./db");

// Load environment variables for local development.
// In production (like Render), these are set directly in the environment.
require("dotenv").config(); // Keep this for local development

var app = express();

// --- Environment Variable Checks (CRITICAL for Production) ---
// These checks ensure that essential configuration is present at startup.
if (!process.env.FRONTEND_URL) {
  console.error('CRITICAL ERROR: FRONTEND_URL environment variable is not set!');
  process.exit(1);
}
if (!process.env.APP_ID) {
  console.error('CRITICAL ERROR: APP_ID environment variable (e.g., for logging/tracking) is not set!');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('CRITICAL ERROR: JWT_SECRET environment variable is not set! This is crucial for token security.');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  console.error('CRITICAL ERROR: Google OAuth environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) are not fully set!');
  process.exit(1);
}
// DB environment variables are checked within db.js

// Set up CORS middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // Allow cookies to be sent
  })
);

// Middleware for logging HTTP requests
app.use(logger("dev")); // 'dev' is good for development, consider 'combined' or 'tiny' for production

// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to parse URL-encoded request bodies
app.use(express.urlencoded({ extended: false }));

// Middleware to parse cookies (essential for HTTP-only JWTs)
app.use(cookieParser());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// --- Initialize Database Connection Pool and Application ---
// This async function wraps the entire app setup to ensure DB is ready before routes are mounted
async function initializeApp() {
  try {
    const dbPool = await createDbPool(); // Attempt to create the database pool
    app.locals.db = dbPool; // Make the MySQL pool available globally via app.locals

    console.log('Backend: MySQL database connection pool initialized and available.');

    // --- Middleware to attach app_id and JWT_SECRET to the request object ---
    // This ensures req.app_id and req.jwtSecret are available to all subsequent middleware and route handlers
    app.use((req, res, next) => {
      req.app_id = process.env.APP_ID;
      req.jwtSecret = process.env.JWT_SECRET;
      next();
    });

    // Now require routes/controllers AFTER database is initialized
    // These routes will now use MySQL for data operations
    var indexRouter = require("./routes/index");
    var authRouter = require("./routes/auth"); // NEW/UPDATED: For Google OAuth and JWT
    var apiRouter = require("./routes/api");   // UPDATED: For Notes/Reminders CRUD

    // --- Route Mounting ---
    app.use("/", indexRouter);
    app.use("/", authRouter); // Mount authentication routes
    app.use("/api", apiRouter); // Mount API routes

    // Catch 404 and forward to error handler
    app.use(function (req, res, next) {
      next(createError(404));
    });

    // Error handler (simplified for API-only backend)
    app.use(function (err, req, res, next) {
      console.error("Backend Error Handler:", err.stack); // Log the full stack trace for debugging

      res.status(err.status || 500);

      res.json({
        message: err.message,
        // Only provide stacktrace in development environment for security
        error: app.get("env") === "development" ? err : {},
      });
    });

    // Export the app instance once it's fully initialized
    module.exports = app;

  } catch (error) {
    console.error('CRITICAL ERROR: Failed to initialize application due to unrecoverable error:', error);
    process.exit(1); // Exit process if app initialization fails
  }
}

// Call the async initialization function
initializeApp();
