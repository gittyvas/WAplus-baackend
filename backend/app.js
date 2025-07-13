// backend/app.js

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const jwt = require('jsonwebtoken');

// Require the database connection module
const createDbPool = require("./db");

// Load environment variables for local development (dotenv is only used for local .env files)
require("dotenv").config();

// Initialize the Express app instance
var app = express();

// --- Environment Variable Checks (CRITICAL for Production) ---
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

// --- Middleware Setup ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// IMPORTANT: This line MUST be commented out or removed.
// Your backend is an API server and should NOT serve frontend static files.
// Your frontend (React app) is served by Netlify.
// app.use(express.static(path.join(__dirname, "public")));

// Middleware to attach app_id and JWT_SECRET to the request object
app.use((req, res, next) => {
  req.app_id = process.env.APP_ID;
  req.jwtSecret = process.env.JWT_SECRET;
  next();
});

// --- Asynchronous Initialization of Database and Routes ---
// Define the initialize function directly on the 'app' object here.
app.initialize = async function() {
  try {
    const dbPool = await createDbPool();
    app.locals.db = dbPool;
    console.log('Backend: MySQL database connection pool initialized and available.');

    // Require and mount routes/controllers AFTER database is initialized
    var indexRouter = require("./routes/index");
    var authRouter = require("./routes/auth");
    var apiRouter = require("./routes/api");

    // Route Mounting
    app.use("/", indexRouter);
    app.use("/", authRouter);
    app.use("/api", apiRouter);

    // Catch 404 and forward to error handler
    app.use(function (req, res, next) {
      next(createError(404));
    });

    // Error handler (simplified for API-only backend)
    app.use(function (err, req, res, next) {
      console.error("Backend Error Handler:", err.stack);

      res.status(err.status || 500);

      res.json({
        message: err.message,
        error: app.get("env") === "development" ? err : {},
      });
    });

    return app; // Return the configured app instance
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to initialize application due to unrecoverable error:', error);
    process.exit(1);
  }
};

// Export the app instance immediately after it's defined and `app.initialize` is attached.
module.exports = app;
