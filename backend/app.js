// backend/app.js

require("dotenv").config(); // 🔹 Always first
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const createDbPool = require("./db");

const app = express();

// --- Critical ENV checks ---
if (!process.env.FRONTEND_URL) throw new Error("FRONTEND_URL is missing");
if (!process.env.APP_ID) throw new Error("APP_ID is missing");
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI)
  throw new Error("Google OAuth env vars are missing");

// Detect prod mode
const isProduction = process.env.NODE_ENV === "production";

// --- Middleware ---
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- Session ---
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// --- Passport config ---
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_REDIRECT_URI,
  passReqToCallback: true,
}, async (req, accessToken, refreshToken, profile, done) => {
  const user = {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value,
    photoURL: profile.photos?.[0]?.value,
    accessToken,
    refreshToken
  };
  done(null, user);
}));

passport.serializeUser((user, done) => {
  done(null, user.id); // Google's ID
});

passport.deserializeUser(async (id, done) => {
  try {
    const db = app.locals.db;
    const [rows] = await db.execute(
      `SELECT id, name AS displayName, email, profile_picture_url AS photoURL FROM users WHERE google_id = ?`,
      [id]
    );
    if (rows.length === 0) return done(null, false);
    done(null, rows[0]);
  } catch (err) {
    console.error("deserializeUser error:", err);
    done(err);
  }
});

// --- Attach app_id, jwtSecret, and userId ---
app.use((req, res, next) => {
  req.app_id = process.env.APP_ID;
  req.jwtSecret = process.env.JWT_SECRET;
  req.userId = req.user ? req.user.id : null;
  next();
});

// --- Async initialization: DB + Routes ---
app.initialize = async () => {
  try {
    const dbPool = await createDbPool();
    app.locals.db = dbPool;
    console.log("✅ MySQL pool initialized");

    // ✅ All route files must export ONLY `router`
    const indexRouter = require("./routes/index");
    const authRouter = require("./routes/auth");
    const apiRouter = require("./routes/api");
    const contactsRouter = require("./routes/contacts");
    const userRouter = require("./routes/user");

    app.use("/", indexRouter);
    app.use("/", authRouter);
    app.use("/api", apiRouter);
    app.use("/api/contacts", contactsRouter);
    app.use("/api/user", userRouter);

    // 404 handler
    app.use((req, res, next) => {
      next(createError(404));
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error("🚨 Error:", err.stack);
      res.status(err.status || 500).json({
        message: err.message,
        error: app.get("env") === "development" ? err : {},
      });
    });

    return app;
  } catch (err) {
    console.error("❌ Failed to initialize app:", err);
    process.exit(1);
  }
};

module.exports = app;
