const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const fetch = require('node-fetch'); // Make sure this is at the top

// ... (other routes and functions like generateAppJwtToken remain the same) ...

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
      // ... (database update logic remains the same)
      await db.execute(
        `UPDATE users SET
          google_access_token = ?, google_refresh_token = ?, access_token_expires_at = ?,
          name = ?, email = ?, profile_picture_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [tokens.access_token, tokens.refresh_token || null, accessTokenExpiresAt, name, email, profilePictureUrl, userId]
      );
    } else {
      // ... (database insert logic remains the same)
      const [result] = await db.execute(
        `INSERT INTO users
          (google_id, email, name, profile_picture_url, google_access_token, google_refresh_token, access_token_expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [googleId, email, name, profilePictureUrl, tokens.access_token, tokens.refresh_token || null, accessTokenExpiresAt]
      );
      userId = result.insertId;
    }

    const appJwt = generateAppJwtToken(userId, jwtSecret);

    res.cookie("app_jwt", appJwt, {
      httpOnly: true,
      secure: true,
      maxAge: 3600000,
      sameSite: "None",
      domain: ".pluse.name.ng",
      path: "/"
    });

    // --- START: MODIFIED WHATSAPP NOTIFICATION LOGIC ---
    try {
      const waApiUrl = "https://wa-api-tdei.onrender.com/login-notify";
      const requestBody = { name, phone: "447398786815" };

      console.log(`Attempting to send WhatsApp notification to ${waApiUrl} with body:`, JSON.stringify(requestBody));

      const response = await fetch(waApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      // Check if the request was successful (status code 2xx)
      if (response.ok) {
        console.log(`WhatsApp template triggered successfully for user: ${name}. Status: ${response.status}`);
      } else {
        // If the server responded with an error, log the details
        const errorBody = await response.text();
        console.error(`Failed to send WhatsApp template. Server responded with status: ${response.status}`);
        console.error("Response body:", errorBody);
      }
    } catch (err) {
      // This will catch network errors (e.g., DNS, server unreachable)
      console.error("A network or fetch API error occurred while sending WhatsApp template:", err);
    }
    // --- END: MODIFIED WHATSAPP NOTIFICATION LOGIC ---

    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error("OAuth callback error:", error.message);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || "oauth_failed")}`);
  }
});


// ... (the rest of your auth.js file remains the same) ...

module.exports = router;

