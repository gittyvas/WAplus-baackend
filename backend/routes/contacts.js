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
// This client is used for refreshing tokens. For API calls, we'll use the specific access token.
let oauthClient;
if (CLIENT_ID && CLIENT_SECRET && REDIRECT_URI) {
  oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
} else {
  console.error("CRITICAL: Google OAuth environment variables not fully set for contacts.js! OAuth2Client may not function correctly.");
}

// Middleware to verify our app's JWT (from HTTP-only cookie)
async function verifyAppJwt(req, res, next) {
  const appJwt = req.cookies.app_jwt;
  const jwtSecret = req.jwtSecret; // jwtSecret is attached by app.js middleware

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
    req.userId = decoded.userId; // Attach our internal user ID to the request
    console.log("Contacts Route Auth: app_jwt verified. User ID:", req.userId);
    next();
  } catch (err) {
    console.error("Contacts Route Auth: Invalid or expired app_jwt:", err.message);
    // Clear the invalid cookie and send 401 to trigger frontend logout
    res.clearCookie('app_jwt', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      domain: '.gitthit.com.ng', // Ensure this matches your domain
      path: '/'
    });
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session." });
  }
}

// Refresh Google access token using refresh token
async function refreshGoogleAccessToken(db, userId, googleRefreshToken) {
  console.log("Contacts Route: Attempting to refresh Google access token for user:", userId);
  if (!oauthClient) {
    throw new Error("OAuth client not configured for token refresh.");
  }

  try {
    // Set only the refresh token credential for the refresh operation
    oauthClient.setCredentials({ refresh_token: googleRefreshToken });
    const { credentials } = await oauthClient.refreshAccessToken();

    const newAccessToken = credentials.access_token;
    const newExpiryDate = new Date(credentials.expiry_date);

    // Update the database with the new access token and expiry
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
      console.error("Contacts Route: Google API Error during refresh:", refreshError.response.data);
    }
    // Re-throw to be caught by the main route handler
    throw new Error("Failed to refresh Google access token. Please re-authenticate.");
  }
}

// GET /api/contacts — Protected route to fetch contacts
router.get("/", verifyAppJwt, async (req, res) => {
  try {
    console.log("Contacts Route: Fetch request for user:", req.userId);
    const db = req.app.locals.db; // Access MySQL database pool from app.js
    if (!db) {
      console.error("Contacts Route: Database not initialized in app.locals.");
      return res.status(500).json({ error: "Database not initialized." });
    }

    // Retrieve Google tokens from the database for the current user
    // --- CRITICAL SQL FIX HERE ---
    const [userRows] = await db.execute(
      `SELECT google_id, google_access_token, google_refresh_token, access_token_expires_at FROM users WHERE id = ?`,
      [req.userId]
    );

    if (userRows.length === 0) {
      console.warn("Contacts Route: User not found in system for ID:", req.userId);
      return res.status(404).json({ error: "User not found in system." });
    }

    let {
      google_access_token: googleAccessToken,
      google_refresh_token: googleRefreshToken,
      access_token_expires_at: accessTokenExpiresAt
    } = userRows[0];

    const now = new Date();
    // Check if token is missing or expires within the next 5 minutes
    const shouldRefresh = !googleAccessToken || (new Date(accessTokenExpiresAt).getTime() - now.getTime()) < 5 * 60 * 1000;

    if (shouldRefresh) {
      if (googleRefreshToken) {
        try {
          googleAccessToken = await refreshGoogleAccessToken(db, req.userId, googleRefreshToken);
        } catch (refreshErr) {
          // If refresh fails, force re-authentication by sending 401
          console.error("Contacts Route: Failed to refresh token, forcing re-auth:", refreshErr.message);
          return res.status(401).json({ error: "Authentication required: Please log in again." });
        }
      } else {
        // No refresh token available, user needs to re-authenticate
        console.warn("Contacts Route: Access token expired and no refresh token found for user:", req.userId);
        return res.status(401).json({ error: "Access token expired and no refresh token found. Please log in again." });
      }
    }

    // Initialize Google People API client with the *current* access token
    // Note: Using a new OAuth2Client instance for the API call with just the access token
    // to avoid issues with global client credentials if they were set for refresh.
    const peopleClient = new OAuth2Client();
    peopleClient.setCredentials({ access_token: googleAccessToken });
    const people = google.people({ version: "v1", auth: peopleClient });

    console.log("Contacts Route: Calling Google People API...");

    const { data } = await people.people.connections.list({
      resourceName: "people/me",
      // --- CORRECTED: Expanded personFields to get all relevant data ---
      personFields: "names,emailAddresses,phoneNumbers,photos,metadata",
      pageSize: 200, // Fetch up to 200 contacts per page
      // You can add 'sources' here if you want to explicitly filter contact types,
      // but by default, it usually includes most relevant contacts.
      // sources: ["READ_SOURCE_TYPE_CONTACT", "READ_SOURCE_TYPE_PROFILE", "READ_SOURCE_TYPE_OTHER_CONTACT"],
    });

    const connections = data.connections || [];
    console.log(`Contacts Route: Raw connections received from Google: ${connections.length}`);

    const processedContacts = connections.map((c) => {
      const name = c.names?.[0]?.displayName || "No Name";
      const email = c.emailAddresses?.[0]?.value || "No Email";
      const photo = c.photos?.[0]?.url || null;
      const phone = c.phoneNumbers?.[0]?.value || "No Phone";
      const lastUpdated = c.metadata?.sources?.[0]?.updateTime || "N/A";

      return {
        id: c.resourceName, // Google's unique ID for the contact
        name,
        email,
        photo,
        phone,
        lastUpdated,
        raw: c, // Include raw data for debugging/future use
      };
    })
    // --- CRITICAL FIX: Expanded filter condition ---
    // Now includes contacts if they have a Name, OR an Email, OR a Phone Number
    .filter(c => c.name !== "No Name" || c.email !== "No Email" || c.phone !== "No Phone");

    console.log(`Contacts Route: Retrieved ${processedContacts.length} contacts after filtering.`);
    res.json(processedContacts);

  } catch (err) {
    console.error("Contacts Route: Error fetching contacts:", err.message);
    if (err.response?.data) {
      console.error("Contacts Route: Google API Error Response:", err.response.data);
    }
    // If the error is due to insufficient scopes, token expiry, etc., return 401 to trigger re-auth
    if (err.message.includes("insufficient authentication scopes") || err.message.includes("expired") || err.message.includes("re-authenticate")) {
      return res.status(401).json({ error: "Authentication required: Please log in again.", details: err.message });
    }
    res.status(500).json({ error: "Failed to fetch contacts", details: err.message });
  }
});

module.exports = router;
