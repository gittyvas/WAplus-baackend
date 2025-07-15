// backend/app.js

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const jwt = require("jsonwebtoken");

const createDbPool = require("./db");
require("dotenv").config();

var app = express();

// --- Critical ENV checks ---
if (!process.env.FRONTEND_URL) {
  console.error("CRITICAL ERROR: FRONTEND_URL environment variable is not set!");
  process.exit(1);
}
if (!process.env.APP_ID) {
  console.error("CRITICAL ERROR: APP_ID environment variable is not set!");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("CRITICAL ERROR: JWT_SECRET environment variable is not set!");
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  console.error("CRITICAL ERROR: Google OAuth environment variables are missing!");
  process.exit(1);
}

// --- Middleware ---
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

// Attach app_id and jwtSecret to every request
app.use((req, res, next) => {
  req.app_id = process.env.APP_ID;
  req.jwtSecret = process.env.JWT_SECRET;
  next();
});

// --- Async initialization (DB + routes) ---
app.initialize = async function () {
  try {
    const dbPool = await createDbPool();
    app.locals.db = dbPool;
    console.log("✅ MySQL pool initialized.");

    // ROUTES
    var indexRouter = require("./routes/index");
    var authRouter = require("./routes/auth");
    var apiRouter = require("./routes/api");
    var contactsRouter = require("./routes/contacts");
    var profileRouter = require("./routes/profile"); // ✅ NEW

    // Mount routes
    app.use("/", indexRouter);
    app.use("/", authRouter);
    app.use("/api", apiRouter);
    app.use("/api/contacts", contactsRouter);
    app.use("/api/profile", profileRouter); // ✅ Mount profile routes here

    // Catch 404
    app.use(function (req, res, next) {
      next(createError(404));
    });

    // Error Handler
    app.use(function (err, req, res, next) {
      console.error("🚨 Error:", err.stack);
      res.status(err.status || 500).json({
        message: err.message,
        error: app.get("env") === "development" ? err : {},
      });
    });

    return app;
  } catch (err) {
    console.error("❌ Fatal error during initialization:", err);
    process.exit(1);
  }
};

module.exports = app;
