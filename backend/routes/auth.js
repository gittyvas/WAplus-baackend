// backend/routes/auth.js

const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken"); // Ensure jwt is imported

// Polyfill for fetch in Node.js environments older than Node 18
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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

// === DISCONNECT GOOGLE ACCOUNT ===
router.post("/auth/disconnect", async (req, res) => {
  const db = req.app.locals.db;
  const jwtSecret = req.jwtSecret;

  try {
    // Verify the JWT from the cookie to get the userId
    const decoded = jwt.verify(req.cookies.app_jwt, jwtSecret);

    // Retrieve the Google access token from the database for the user
    const [rows] = await db.execute('SELECT google_access_token FROM users WHERE id = ?', [decoded.userId]);
    const token = rows[0]?.google_access_token;

    // If a Google access token exists, revoke it with Google
    if (token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-type": "application/x-www-form-urlencoded" },
        body: `token=${token}`
      });
      console.log(`Google token revoked for user ${decoded.userId}`);
    }

    // Nullify all Google-related tokens in the database for the user
    await db.execute(
      `UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, access_token_expires_at = NULL WHERE id = ?`,
      [decoded.userId]
    );
    console.log(`Google tokens nullified in DB for user ${decoded.userId}`);

    // Clear the application's own JWT cookie
    res.clearCookie("app_jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      domain: ".gitthit.com.ng",
      path: "/"
    });

    res.status(200).json({ message: "Disconnected from Google and all tokens revoked" });
  } catch (error) {
    console.error("Disconnect error:", error.message);
    // If JWT verification fails or token is invalid, still attempt to clear cookie and respond
    res.clearCookie("app_jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      domain: ".gitthit.com.ng",
      path: "/"
    });
    res.status(500).json({ error: "Failed to disconnect Google account or invalid session." });
  }
});

// === DELETE ACCOUNT ===
router.delete("/auth/delete", async (req, res) => {
  const db = req.app.locals.db;
  const jwtSecret = req.jwtSecret;

  try {
    // Verify the JWT from the cookie to get the userId
    const decoded = jwt.verify(req.cookies.app_jwt, jwtSecret);

    // Retrieve the Google access token from the database for the user
    const [rows] = await db.execute('SELECT google_access_token FROM users WHERE id = ?', [decoded.userId]);
    const token = rows[0]?.google_access_token;

    // If a Google access token exists, revoke it with Google
    if (token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-type": "application/x-www-form-urlencoded" },
        body: `token=${token}`
      });
      console.log(`Google token revoked during account deletion for user ${decoded.userId}`);
    }

    // Delete the user record from the database
    await db.execute('DELETE FROM users WHERE id = ?', [decoded.userId]);
    console.log(`User ${decoded.userId} deleted from DB.`);

    // Clear the application's own JWT cookie
    res.clearCookie("app_jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      domain: ".gitthit.com.ng",
      path: "/"
    });

    res.status(200).json({ message: "Account deleted and access revoked." });
  } catch (error) {
    console.error("Account deletion error:", error.message);
    // Even if deletion fails, attempt to clear the cookie for security
    res.clearCookie("app_jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      domain: ".gitthit.com.ng",
      path: "/"
    });
    res.status(500).json({ error: "Account deletion failed." });
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
