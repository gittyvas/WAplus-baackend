// backend/routes/auth.js

const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const generateAppJwtToken = (userId, jwtSecret) => {
  return jwt.sign({ userId }, jwtSecret, { expiresIn: "1h" });
};

// === START OAUTH ===
router.get("/auth/google", (req, res) => {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    console.error("CRITICAL ERROR: Google OAuth config missing.");
    return res.status(500).json({ message: "Server OAuth configuration error." });
  }

  const client = new OAuth2Client(GOOGLE_CLIENT_ID, "", GOOGLE_REDIRECT_URI);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: false,
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly"
    ]
  });

  res.redirect(authUrl);
});

// === OAUTH CALLBACK ===
router.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const db = req.app.locals.db;
  const jwtSecret = req.jwtSecret;
  const FRONTEND_URL = process.env.FRONTEND_URL;

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!code || !db || !jwtSecret || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error("Missing configuration or code");
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const { tokens } = await client.getToken(code);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.email;
    const profilePictureUrl = payload.picture;
    const accessTokenExpiresAt = new Date(tokens.expiry_date);

    let userId;
    const [rows] = await db.execute('SELECT id FROM users WHERE google_id = ?', [googleId]);

    if (rows.length > 0) {
      userId = rows[0].id;
      await db.execute(
        `UPDATE users SET
         google_access_token = ?,
         google_refresh_token = ?,
         access_token_expires_at = ?,
         name = ?,
         email = ?,
         profile_picture_url = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          tokens.access_token,
          tokens.refresh_token || null,
          accessTokenExpiresAt,
          name,
          email,
          profilePictureUrl,
          userId
        ]
      );
    } else {
      const [result] = await db.execute(
        `INSERT INTO users
         (google_id, email, name, profile_picture_url, google_access_token, google_refresh_token, access_token_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          googleId,
          email,
          name,
          profilePictureUrl,
          tokens.access_token,
          tokens.refresh_token || null,
          accessTokenExpiresAt
        ]
      );
      userId = result.insertId;
    }

    const appJwt = generateAppJwtToken(userId, jwtSecret);

    res.cookie("app_jwt", appJwt, {
      httpOnly: true,
      secure: true,
      maxAge: 3600000, // 1 hour
      sameSite: "None",
      domain: ".gitthit.com.ng",
      path: "/"
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error("OAuth callback error:", error.message);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || "oauth_failed")}`);
  }
});

// === LOGOUT ===
router.post("/auth/logout", (req, res) => {
  res.clearCookie("app_jwt", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    domain: ".gitthit.com.ng",
    path: "/"
  });
  res.status(200).json({ message: "Logged out successfully" });
});

module.exports = router;
