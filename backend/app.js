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
// In production environments like Railway, these are injected directly, so this line
// only affects local runs.
require("dotenv").config();

// Initialize the Express app instance
var app = express();

// --- Environment Variable Checks (CRITICAL for Production) ---
// These checks ensure essential environment variables are set before the app starts.
// If any are missing, the process will exit, preventing misconfiguration in production.
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
// CORS (Cross-Origin Resource Sharing) middleware
// Configured to allow requests only from your specified frontend URL, with credentials (cookies).
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Only allow requests from your frontend domain
    credentials: true, // Allow cookies to be sent with requests
  })
);

// Logger middleware (e.g., 'dev' format for concise output during development)
app.use(logger("dev"));

// Body parsing middleware for JSON and URL-encoded data
app.use(express.json()); // Parses incoming requests with JSON payloads
app.use(express.urlencoded({ extended: false })); // Parses incoming requests with URL-encoded payloads

// Cookie parser middleware to parse cookies attached to the client request object
app.use(cookieParser());

// IMPORTANT: Commented out the static file serving middleware.
// Your backend is an API server and should NOT serve frontend static files.
// Your frontend (React app) is served by Netlify.
// app.use(express.static(path.join(__dirname, "public")));

// Middleware to attach commonly used environment variables to the request object.
// This makes them easily accessible in route handlers without re-accessing process.env.
app.use((req, res, next) => {
  req.app_id = process.env.APP_ID;
  req.jwtSecret = process.env.JWT_SECRET;
  next();
});

// --- Asynchronous Initialization of Database and Routes ---
// This function initializes the database connection pool and mounts all API routes.
// It's called after the Express app instance is created but before it starts listening.
app.initialize = async function() {
  try {
    // Attempt to create a database connection pool
    const dbPool = await createDbPool();
    app.locals.db = dbPool; // Store the database pool on app.locals for global access in routes
    console.log('Backend: MySQL database connection pool initialized and available.');

    // Require and mount routes/controllers AFTER the database is initialized.
    // This ensures that route handlers have access to the `app.locals.db` object.
    var indexRouter = require("./routes/index"); // Basic routes (e.g., health check)
    var authRouter = require("./routes/auth");   // Authentication related routes (Google OAuth)
    var apiRouter = require("./routes/api");     // Your main API routes (e.g., for contacts, dashboard data)

    // Route Mounting - Order matters!
    // Specific routes should generally come before more general or catch-all routes.
    app.use("/", indexRouter); // Mount index routes at the root path
    app.use("/", authRouter);   // Mount auth routes at the root path (e.g., /auth/google)
    app.use("/api", apiRouter); // Mount API routes under the /api prefix

    // Catch 404 (Not Found) and forward to error handler
    // This middleware will be hit if no other route handler matches the request.
    app.use(function (req, res, next) {
      next(createError(404));
    });

    // Error handler middleware (simplified for an API-only backend)
    // This catches errors passed by `next(err)` or unhandled exceptions.
    app.use(function (err, req, res, next) {
      console.error("Backend Error Handler:", err.stack); // Log the full error stack for debugging

      // Set HTTP status code based on the error, default to 500 (Internal Server Error)
      res.status(err.status || 500);

      // Send a JSON response with the error message.
      // In development, include the full error object for more details.
      // In production, send a generic error to avoid leaking sensitive info.
      res.json({
        message: err.message,
        error: app.get("env") === "development" ? err : {}, // Only expose full error in dev
      });
    });

    return app; // Return the configured app instance
  } catch (error) {
    // If database or initial setup fails, log a critical error and exit the process.
    console.error('CRITICAL ERROR: Failed to initialize application due to unrecoverable error:', error);
    process.exit(1); // Terminate the application if initialization fails
  }
};

// Export the app instance immediately after it's defined and `app.initialize` is attached.
// The `bin/www` file will then call `app.initialize()` and start the server.
module.exports = app;

