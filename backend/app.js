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
const helmet = require('helmet'); // ✅ ADDED: Helmet for security headers

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
app.use(helmet()); // ✅ ADDED: Helmet middleware for security headers

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
  // This user object is what gets passed to serializeUser
  const user = {
    google_id: profile.id, // Store Google's ID
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value,
    photoURL: profile.photos?.[0]?.value,
    accessToken,
    refreshToken
  };
  done(null, user);
}));

passport.serializeUser((user, done) => {
  // Store the Google ID in the session, as it's what we use to look up the user
  done(null, user.google_id); // ✅ Changed to user.google_id (from user.id)
});

passport.deserializeUser(async (googleId, done) => { // ✅ Parameter renamed to googleId for clarity
  try {
    const db = app.locals.db;
    // Select the internal 'id' (PK), and other profile data
    const [rows] = await db.execute(
      `SELECT id, google_id, name AS displayName, email, profile_picture_url AS photoURL FROM users WHERE google_id = ?`,
      [googleId] // ✅ Query by google_id
    );
    if (rows.length === 0) return done(null, false);

    // ✅ CRITICAL FIX: Return an object where 'id' is the internal numeric ID
    done(null, {
      id: rows[0].id, // This is the internal numeric primary key from your 'users' table
      google_id: rows[0].google_id, // Keep Google ID for reference if needed
      email: rows[0].email,
      displayName: rows[0].displayName,
      photoURL: rows[0].photoURL,
    });
  } catch (err) {
    console.error("deserializeUser error:", err);
    done(err);
  }
});

// --- Attach app_id, jwtSecret, and userId ---
app.use((req, res, next) => {
  req.app_id = process.env.APP_ID;
  req.jwtSecret = process.env.JWT_SECRET;
  // req.userId should now correctly be the internal numeric ID from deserializeUser
  req.userId = req.user ? req.user.id : null; // ✅ This will now be the internal numeric ID
  next();
});

// --- Async initialization: DB + Routes ---
app.initialize = async () => {
  try {
    const dbPool = await createDbPool();
    app.locals.db = dbPool;
    console.log("✅ MySQL pool initialized");

    // Ensure reminders and notes tables exist
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL, -- ✅ FIX: Changed back to INT NOT NULL
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATETIME DEFAULT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- ✅ FIX: References users(id)
      )
    `);
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL, -- ✅ FIX: Changed back to INT NOT NULL
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- ✅ FIX: References users(id)
      )
    `);

    // Route imports
    const indexRouter = require("./routes/index");
    const authRouter = require("./routes/auth");
    const apiRouter = require("./routes/api");
    const contactsRouter = require("./routes/contacts");
    const userRouter = require("./routes/user");
    const profileRouter = require("./routes/profile");
    const remindersRouter = require("./routes/reminders");
    const notesRouter = require("./routes/notes");

    // Route mounting
    app.use("/", indexRouter);
    app.use("/", authRouter);
    app.use("/api", apiRouter);
    app.use("/api/contacts", contactsRouter);
    app.use("/api/user", userRouter);
    app.use("/api/profile", profileRouter);
    app.use("/api/reminders", remindersRouter);
    app.use("/api/notes", notesRouter);

    // 404 handler
    app.use((req, res, next) => {
      next(createError(404));
    });

    // Error handler
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
