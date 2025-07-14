// backend/routes/auth.js

var express = require("express");
var router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const generateAppJwtToken = (userId, jwtSecret) => {
  return jwt.sign({ userId }, jwtSecret, { expiresIn: '1h' });
};

router.get("/auth/google", (req, res) => {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    console.error('CRITICAL ERROR: Google OAuth config missing for /auth/google redirect.');
    return res.status(500).json({ message: 'Server OAuth configuration error.' });
  }

  const client = new OAuth2Client(GOOGLE_CLIENT_ID, '', GOOGLE_REDIRECT_URI);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });
  console.log("Auth Route: Redirecting to Google OAuth URL.");
  res.redirect(authUrl);
});

router.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const db = req.app.locals.db;
  const jwtSecret = req.jwtSecret;
  const FRONTEND_URL = process.env.FRONTEND_URL;

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
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error('Auth Route: Google OAuth environment variables missing for callback.');
    return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent("Server OAuth configuration error.")}`);
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

    console.log("Auth Route: Attempting to exchange code for tokens...");
    const { tokens } = await client.getToken(code);
    console.log("Auth Route: Successfully exchanged code for tokens!");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const googleUserPayload = ticket.getPayload();

    const googleId = googleUserPayload.sub;
    const email = googleUserPayload.email;
    const name = googleUserPayload.name || googleUserPayload.email;
    const profilePictureUrl = googleUserPayload.picture;

    const accessTokenExpiresAt = new Date(tokens.expiry_date);

    let userId;
    const [rows] = await db.execute('SELECT id FROM users WHERE google_id = ?', [googleId]);

    if (rows.length > 0) {
      userId = rows[0].id;
      await db.execute(
        `UPDATE users SET
           google_access_token = ?,
           google_refresh_token = COALESCE(?, google_refresh_token),
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
      const [result] = await db.execute(
        `INSERT INTO users (google_id, email, name, profile_picture_url, google_access_token, google_refresh_token, access_token_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [googleId, email, name, profilePictureUrl, tokens.access_token, tokens.refresh_token, accessTokenExpiresAt]
      );
      userId = result.insertId;
      console.log(`New user ${userId} (Google ID: ${googleId}) created from Google OAuth.`);
    }

    const appJwt = generateAppJwtToken(userId, jwtSecret);

    // --- IMPORTANT FIX: SameSite: 'None' and secure: true ---
    res.cookie('app_jwt', appJwt, {
      httpOnly: true,
      secure: true, // MUST be true when SameSite is 'None'
      maxAge: 3600000, // 1 hour in milliseconds (matches JWT expiry)
      sameSite: 'None', // Allow cross-site cookie sending (essential for different subdomains)
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);

  } catch (error) {
    console.error("Auth Route: Error during OAuth callback:", error.message);
    if (error.response) {
      console.error("Auth Route: Google API Error Response Data:", error.response.data);
    }
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || "oauth_failed")}`);
  }
});

router.post('/auth/logout', (req, res) => {
  // When clearing the cookie, SameSite and Secure attributes must match
  res.clearCookie('app_jwt', {
    httpOnly: true,
    secure: true, // MUST be true
    sameSite: 'None', // MUST be 'None'
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
