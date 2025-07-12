// backend/routes/auth.js

var express = require("express");
var router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
// const { google } = require("googleapis"); // Not directly needed for basic userinfo, client.request is sufficient

// No need for dotenv.config() here, it's handled in app.js
// No need for local consts for env vars, access them via process.env directly or req object where passed

// Utility function to generate a JWT for your application
const generateAppJwtToken = (userId, jwtSecret) => {
  // Token expires in 1 hour (adjust as needed for your application's security and UX)
  return jwt.sign({ userId }, jwtSecret, { expiresIn: '1h' });
};

// --- Google OAuth Login Redirect ---
// This route initiates the Google OAuth flow by redirecting the user to Google's consent screen.
router.get("/auth/google", (req, res) => {
  // Ensure these environment variables are set in Render/local .env
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    console.error('CRITICAL ERROR: Google OAuth config missing for /auth/google redirect.');
    return res.status(500).json({ message: 'Server OAuth configuration error.' });
  }

  const client = new OAuth2Client(GOOGLE_CLIENT_ID, '', GOOGLE_REDIRECT_URI); // Client secret not needed for generateAuthUrl

  const authUrl = client.generateAuthUrl({
    access_type: "offline", // Request a refresh token for long-term access
    response_type: "code",
    prompt: "consent",      // Always show consent screen to ensure refresh token is granted on first login
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile", // Basic profile info (name, picture)
      "https://www.googleapis.com/auth/userinfo.email",   // User's email address
      // "https://www.googleapis.com/auth/contacts.readonly", // REMOVED: If you're not saving contacts, this might not be needed.
      // "https://www.googleapis.com/auth/contacts.other.readonly", // REMOVED: Same as above.
    ].join(" "),
  });
  console.log("Auth Route: Redirecting to Google OAuth URL.");
  res.redirect(authUrl);
});

// --- Google OAuth Callback ---
// This route handles the redirect back from Google after the user grants consent.
router.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const db = req.app.locals.db; // Access the MySQL pool from app.locals
  const jwtSecret = req.jwtSecret; // Access the JWT secret from req (set in app.js middleware)
  const FRONTEND_URL = process.env.FRONTEND_URL; // Frontend URL for redirects

  // Ensure all necessary environment variables are available
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!code) {
    console.error("Auth Route: No authorization code received in OAuth callback.");
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
  if (!db) {
    console.error("Auth Route: MySQL DB instance not found in app.locals.");
    return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent("Backend DB not initialized.")}`);
  }
  if (!jwtSecret) {
    console.error('Auth Route: JWT_SECRET not available.');
    return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent("Server configuration error.")}`);
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error('Auth Route: Google OAuth environment variables missing for callback.');
    return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent("Server OAuth configuration error.")}`);
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

    // 1. Exchange authorization code for tokens (access_token, id_token, refresh_token)
    console.log("Auth Route: Attempting to exchange code for tokens...");
    const { tokens } = await client.getToken(code);
    console.log("Auth Route: Successfully exchanged code for tokens!");

    // 2. Get user info from Google using the ID token (more reliable than userinfo endpoint for basic profile)
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const googleUserPayload = ticket.getPayload();

    const googleId = googleUserPayload.sub; // Google's unique user ID
    const email = googleUserPayload.email;
    const name = googleUserPayload.name || googleUserPayload.email;
    const profilePictureUrl = googleUserPayload.picture;

    // Calculate access token expiry time
    const accessTokenExpiresAt = new Date(tokens.expiry_date);

    // 3. Find or Create User in your MySQL database
    let userId;
    const [rows] = await db.execute('SELECT id FROM users WHERE google_id = ?', [googleId]);

    if (rows.length > 0) {
      // User exists, update their tokens and profile info
      userId = rows[0].id;
      await db.execute(
        `UPDATE users SET
           google_access_token = ?,
           google_refresh_token = COALESCE(?, google_refresh_token), -- Only update refresh token if a new one is provided
           access_token_expires_at = ?,
           name = ?,
           email = ?,
           profile_picture_url = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [tokens.access_token, tokens.refresh_token, accessTokenExpiresAt, name, email, profilePictureUrl, userId]
      );
      console.log(`User ${userId} (Google ID: ${googleId}) updated with new Google tokens.`);
    } else {
      // New user, insert into database
      const [result] = await db.execute(
        `INSERT INTO users (google_id, email, name, profile_picture_url, google_access_token, google_refresh_token, access_token_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [googleId, email, name, profilePictureUrl, tokens.access_token, tokens.refresh_token, accessTokenExpiresAt]
      );
      userId = result.insertId;
      console.log(`New user ${userId} (Google ID: ${googleId}) created from Google OAuth.`);
    }

    // 4. Generate your application's JWT
    const appJwt = generateAppJwtToken(userId, jwtSecret);

    // 5. Set the JWT as an HTTP-only cookie
    // secure: true - only send over HTTPS (essential for production)
    // httpOnly: true - prevents client-side JavaScript access
    // sameSite: 'Lax' or 'None' - adjust based on your frontend/backend domain setup
    // For cross-domain (frontend on Netlify, backend on Render), sameSite: 'None' and secure: true are often needed.
    // If sameSite is 'None', secure MUST be true.
    res.cookie('app_jwt', appJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      maxAge: 3600000, // 1 hour in milliseconds (matches JWT expiry)
      sameSite: 'Lax', // Recommended default. Change to 'None' if cross-domain issues.
    });

    // Redirect to frontend dashboard. The frontend can then make API calls
    // to get user data using the JWT from the cookie.
    res.redirect(`${FRONTEND_URL}/dashboard`);

  } catch (error) {
    console.error("Auth Route: Error during OAuth callback:", error.message);
    if (error.response) {
      console.error("Auth Route: Google API Error Response Data:", error.response.data);
    }
    // Redirect to frontend with an error message
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || "oauth_failed")}`);
  }
});

// --- Logout Route ---
router.post('/auth/logout', (req, res) => {
  // Clear the HTTP-only cookie
  res.clearCookie('app_jwt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax', // Must match the sameSite setting used when setting the cookie
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
