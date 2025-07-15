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

// Your Google OAuth Client ID and Secret – set these in env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Initialize OAuth2Client globally, but ensure env vars are present
let oauthClient;
if (CLIENT_ID && CLIENT_SECRET && REDIRECT_URI) {
  oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
} else {
  console.error("CRITICAL: Google OAuth environment variables not fully set for contacts.js! OAuth2Client may not function correctly.");
}

// Middleware to verify our app's JWT
async function verifyAppJwt(req, res, next) {
  const appJwt = req.cookies.app_jwt;
  const jwtSecret = req.jwtSecret;

  if (!appJwt) {
    console.warn("Contacts Route Auth: No app_jwt cookie found.");
    return res.status(401).json({ error: "Unauthorized: No session token provided." });
  }
  if (!jwtSecret) {
    console.error("Contacts Route Auth: JWT_SECRET not configured on server.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    const decoded = jwt.verify(appJwt, jwtSecret);
    req.userId = decoded.userId;
    console.log("Contacts Route Auth: app_jwt verified. User ID:", req.userId);
    next();
  } catch (err) {
    console.error("Contacts Route Auth: Invalid or expired app_jwt:", err.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session." });
  }
}

// Refresh Google access token using refresh token
async function refreshGoogleAccessToken(db, userId, googleRefreshToken) {
  console.log("Contacts Route: Attempting to refresh Google access token for user:", userId);
  if (!oauthClient) {
    throw new Error("OAuth client not configured.");
  }

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

    console.log("Contacts Route: Google access token successfully refreshed for user:", userId);
    return newAccessToken;
  } catch (refreshError) {
    console.error("Contacts Route: Error refreshing token for user:", userId, refreshError.message);
    if (refreshError.response?.data) {
      console.error("Contacts Route: Google API Error:", refreshError.response.data);
    }
    throw new Error("Failed to refresh Google access token.");
  }
}

// GET /api/contacts — Protected route
router.get("/", verifyAppJwt, async (req, res) => {
  try {
    console.log("Contacts Route: Fetch request for user:", req.userId);
    const db = req.app.locals.db;
    if (!db) return res.status(500).json({ error: "Database not initialized." });

    const [userRows] = await db.execute(
      `SELECT google_id, google_access_token, google_refresh_token, access_token_expires_at
       FROM users WHERE id = ?`,
      [req.userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found in system." });
    }

    let {
      google_access_token: googleAccessToken,
      google_refresh_token: googleRefreshToken,
      access_token_expires_at: accessTokenExpiresAt
    } = userRows[0];

    const now = new Date();
    const shouldRefresh = !googleAccessToken || (new Date(accessTokenExpiresAt).getTime() - now.getTime()) < 5 * 60 * 1000;

    if (shouldRefresh && googleRefreshToken) {
      googleAccessToken = await refreshGoogleAccessToken(db, req.userId, googleRefreshToken);
    } else if (shouldRefresh && !googleRefreshToken) {
      return res.status(401).json({ error: "Access token expired and no refresh token found." });
    }

    const googlePeopleApiUrl = "https://people.googleapis.com/v1/people/me/connections"; // ✅ FIXED
    console.log("Contacts Route: Calling Google People API...");

    const { data } = await axios.get(googlePeopleApiUrl, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      params: {
        personFields: "names,emailAddresses,phoneNumbers,photos,metadata",
        pageSize: 200,
      },
    });

    const contacts = (data.connections || []).map((c) => {
      const name = c.names?.[0]?.displayName || "No Name";
      const email = c.emailAddresses?.[0]?.value || "No Email";
      const photo = c.photos?.[0]?.url || null;
      const phone = c.phoneNumbers?.[0]?.value || "No Phone";
      const lastUpdated = c.metadata?.sources?.[0]?.updateTime || "N/A";

      return {
        id: c.resourceName,
        name,
        email,
        photo,
        phone,
        lastUpdated,
        raw: c,
      };
    }).filter(c => c.name !== "No Name" || c.email !== "No Email");

    console.log(`Contacts Route: Retrieved ${contacts.length} contacts.`);
    res.json(contacts);

  } catch (err) {
    console.error("Contacts Route: Error fetching contacts:", err.message);
    if (err.response?.data) {
      console.error("Contacts Route: Google API Error Response:", err.response.data);
    }
    res.status(500).json({ error: "Failed to fetch contacts", details: err.message });
  }
});

module.exports = router;
