// backend/middleware/auth.js

const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
// Removed: No longer using Firebase Admin SDK
// const { getFirestore } = require("firebase-admin/firestore");

// No need for dotenv.config() here, it's handled in app.js
// No need for local consts for env vars, access them via req object where passed
// GOOGLE_CLIENT_ID is accessed directly via process.env where needed for OAuth2Client init

/**
 * Middleware to verify application JWT and manage Google OAuth tokens.
 * Attaches user info (from app JWT) and Google access token (from DB, refreshed if needed) to req.user.
 */
const authenticateToken = async (req, res, next) => {
  console.log("\n--- Backend Auth Middleware Start ---");
  console.log("Request URL:", req.originalUrl);

  // Get JWT from HTTP-only cookie
  const appToken = req.cookies.app_jwt;

  console.log("Extracted app_jwt from cookie:", appToken ? "Exists" : "Missing");

  if (!appToken) {
    console.log("Auth Middleware: No application JWT provided. Sending 401.");
    return res.status(401).json({ message: "Authentication required: No application token provided." });
  }

  const jwtSecret = req.jwtSecret; // Access JWT secret from req (set in app.js middleware)
  const db = req.app.locals.db; // Access the MySQL pool from app.locals

  if (!jwtSecret) {
    console.error('CRITICAL ERROR: JWT_SECRET not available in authentication middleware.');
    return res.status(500).json({ message: 'Server configuration error (JWT_SECRET missing).' });
  }
  if (!db) {
    console.error("CRITICAL ERROR: MySQL DB instance not found in app.locals.");
    return res.status(500).json({ message: "Server configuration error (Database not initialized)." });
  }

  try {
    // 1. Verify the application's JWT
    console.log("Auth Middleware: Verifying application JWT...");
    const decodedAppJwt = jwt.verify(appToken, jwtSecret);
    req.user = decodedAppJwt; // Attach decoded JWT payload (e.g., userId)
    console.log("Auth Middleware: Application JWT Decoded successfully. User ID:", decodedAppJwt.userId);

    // 2. Retrieve Google OAuth tokens from MySQL
    console.log("Auth Middleware: Fetching Google tokens from MySQL for userId:", req.user.userId);
    const [userRows] = await db.execute(
      'SELECT google_access_token, google_refresh_token, access_token_expires_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (userRows.length === 0) {
      console.warn("Auth Middleware: User not found in MySQL for userId:", req.user.userId);
      return res.status(401).json({ message: "Authentication failed: User data not found." });
    }

    let { google_access_token, google_refresh_token, access_token_expires_at } = userRows[0];

    // Ensure access_token_expires_at is a Date object
    const googleTokenExpiryDate = access_token_expires_at ? new Date(access_token_expires_at) : null;

    console.log("Auth Middleware: Google Access Token Expiry (from DB):", googleTokenExpiryDate ? googleTokenExpiryDate.toISOString() : "None");
    console.log("Auth Middleware: Current Time:", new Date().toISOString());

    // 3. Check if Google access token is expired or about to expire (e.g., within 5 minutes grace period)
    if (!google_access_token || !googleTokenExpiryDate || googleTokenExpiryDate.getTime() < (Date.now() + 5 * 60 * 1000)) {
      console.log("Auth Middleware: Google access token expired or near expiry. Attempting to refresh...");

      if (!google_refresh_token) {
        console.error("Auth Middleware: No Google refresh token available for user:", req.user.userId);
        return res.status(401).json({ message: "Authentication failed: Google session expired, no refresh token." });
      }

      try {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // Needed for OAuth2Client constructor

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
          console.error('CRITICAL ERROR: Google OAuth config missing for token refresh.');
          return res.status(500).json({ message: 'Server OAuth configuration error.' });
        }

        const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        client.setCredentials({ refresh_token: google_refresh_token });

        const { credentials } = await client.refreshAccessToken();

        google_access_token = credentials.access_token;
        const newExpiryDate = new Date(Date.now() + (credentials.expires_in * 1000)); // expires_in is in seconds

        // Update MySQL with new tokens and expiry
        await db.execute(
          `UPDATE users SET
             google_access_token = ?,
             access_token_expires_at = ?,
             google_refresh_token = COALESCE(?, google_refresh_token), -- Google might not always return a new refresh token
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [google_access_token, newExpiryDate, credentials.refresh_token, req.user.userId]
        );
        console.log("Auth Middleware: Google access token refreshed and MySQL updated. New expiry:", newExpiryDate.toISOString());

      } catch (refreshError) {
        console.error("Auth Middleware: Error refreshing Google access token:", refreshError.message);
        // If refresh fails, the user needs to re-authenticate
        return res.status(401).json({ message: "Authentication failed: Could not refresh Google token. Please re-authenticate." });
      }
    } else {
      console.log("Auth Middleware: Google access token is valid and not near expiry.");
    }

    // Attach the (potentially refreshed) Google Access Token to req.user for downstream use
    req.user.googleAccessToken = google_access_token;
    console.log("Auth Middleware: Successfully attached Google Access Token to req.user. Proceeding.");
    next(); // Proceed to the next middleware/route handler

  } catch (error) {
    console.error("Auth Middleware: JWT verification or token refresh failed:", error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Authentication failed: Application token expired." });
    }
    // For any other JWT or unexpected error
    return res.status(403).json({ message: "Authentication failed: Invalid token." });
  } finally {
    console.log("--- Backend Auth Middleware End ---\n");
  }
};

module.exports = authenticateToken;
