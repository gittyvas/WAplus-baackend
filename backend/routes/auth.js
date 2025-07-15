// backend/routes/contacts.js
// -----------------------------------------------------------------------------
// Contacts route – fetches Google contacts for the authenticated Pulse user.
// Uses the app_jwt (from HTTP-only cookie) for authentication,
// then looks up the stored Google *access* token in the database to call People API.
// Includes logic to refresh Google access token if expired.
// -----------------------------------------------------------------------------

const express = require("express");
const router = express.Router();
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

// Environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Initialize Google OAuth client
let oauthClient;
if (CLIENT_ID && CLIENT_SECRET && REDIRECT_URI) {
  oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
} else {
  console.error("CRITICAL: Google OAuth environment variables not fully set for contacts.js!");
}

// Middleware: Verify app_jwt from cookie
async function verifyAppJwt(req, res, next) {
  const appJwt = req.cookies.app_jwt;
  const jwtSecret = req.jwtSecret;

  if (!appJwt) {
    console.warn("Contacts Route Auth: No app_jwt cookie found.");
    return res.status(401).json({ error: "Unauthorized: No session token provided." });
  }
  if (!jwtSecret) {
    console.error("Contacts Route Auth: JWT_SECRET not configured.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    const decoded = jwt.verify(appJwt, jwtSecret);
    req.userId = decoded.userId;
    console.log("Contacts Route Auth: Verified app_jwt. User ID:", req.userId);
    next();
  } catch (err) {
    console.error("Contacts Route Auth: Invalid/expired app_jwt:", err.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session." });
  }
}

// Helper: Refresh Google access token using refresh token
async function refreshGoogleAccessToken(db, userId, googleRefreshToken) {
  console.log("Contacts Route: Refreshing Google token for user:", userId);

  try {
    oauthClient.setCredentials({ refresh_token: googleRefreshToken });
    const { credentials } = await oauthClient.refreshAccessToken();

    const newAccessToken = credentials.access_token;
    const newExpiryDate = new Date(credentials.expiry_date);

    await db.execute(
      `UPDATE users SET
         google_access_token = ?,
         access_token_expires_at = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newAccessToken, newExpiryDate, userId]
    );

    console.log("Contacts Route: Token refreshed and saved.");
    return newAccessToken;
  } catch (err) {
    console.error("Contacts Route: Failed to refresh token:", err.message);
    if (err.response?.data) {
      console.error("Google API Error Response:", err.response.data);
    }
    throw new Error("Failed to refresh Google access token.");
  }
}

// GET /contacts – Fetch Google contacts
router.get("/", verifyAppJwt, async (req, res) => {
  try {
    console.log("Contacts Route: Fetching contacts for user:", req.userId);
    const db = req.app.locals.db;

    if (!db || !oauthClient) {
      return res.status(500).json({ error: "Server configuration error." });
    }

    const [[user]] = await db.execute(
      `SELECT google_id, google_access_token, google_refresh_token, access_token_expires_at
       FROM users WHERE id = ?`,
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let {
      google_id: googleUid,
      google_access_token: googleAccessToken,
      google_refresh_token: googleRefreshToken,
      access_token_expires_at: accessTokenExpiresAt,
    } = user;

    const now = new Date();
    const expiresSoon = accessTokenExpiresAt && new Date(accessTokenExpiresAt).getTime() - now.getTime() < 5 * 60 * 1000;

    if (!googleAccessToken || expiresSoon) {
      if (googleRefreshToken) {
        googleAccessToken = await refreshGoogleAccessToken(db, req.userId, googleRefreshToken);
      } else {
        return res.status(401).json({ error: "Missing access token. Please re-authenticate." });
      }
    }

    if (!googleAccessToken) {
      return res.status(401).json({ error: "No valid Google access token. Please re-authenticate." });
    }

    // ✅ FIXED: Use plain string for the API URL
    const googlePeopleApiUrl = "https://people.googleapis.com/v1/people/me/connections";

    const { data } = await axios.get(googlePeopleApiUrl, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      params: {
        personFields: "names,emailAddresses,phoneNumbers,photos,metadata",
        pageSize: 200,
      },
    });

    const connections = data.connections || [];

    const processedContacts = connections
      .map((c) => {
        const name = c.names?.[0]?.displayName || "No Name";
        const email = c.emailAddresses?.[0]?.value || "No Email";
        const phone = c.phoneNumbers?.[0]?.value || "No Phone";
        const photo = c.photos?.[0]?.url || null;
        const lastUpdated = c.metadata?.sources?.[0]?.updateTime || "N/A";

        return {
          id: c.resourceName,
          name,
          email,
          phone,
          photo,
          lastUpdated,
          raw: c,
        };
      })
      .filter((contact) => contact.name !== "No Name" || contact.email !== "No Email");

    console.log(`Contacts Route: Returned ${processedContacts.length} contacts.`);
    res.json(processedContacts);
  } catch (err) {
    console.error("Contacts Route: Error:", err.response?.data || err.message);
    if (err.response?.status === 401 || err.response?.status === 403) {
      return res.status(401).json({ error: "Google access token expired. Please re-authenticate." });
    }
    res.status(500).json({ error: "Failed to fetch contacts", details: err.message });
  }
});

module.exports = router;
