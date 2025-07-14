// google-oauth-app/backend/routes/contacts.js
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
const jwt = require("jsonwebtoken"); // Import jwt for verification

// Your Google OAuth Client ID and Secret – set these in env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/**
 * verifyAppJwt - Express middleware that checks the 'app_jwt' cookie.
 * If valid, it places the decoded userId on `req.userId` and calls `next()`.
 * If invalid/missing, it returns 401.
 * This middleware should be used for protected routes.
 */
async function verifyAppJwt(req, res, next) {
    const appJwt = req.cookies.app_jwt; // Get JWT from HTTP-only cookie
    const jwtSecret = req.jwtSecret; // Access jwtSecret from req (set in app.js)

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
        req.userId = decoded.userId; // Attach userId to the request
        console.log("Contacts Route Auth: app_jwt verified. User ID:", req.userId);
        next();
    } catch (err) {
        console.error("Contacts Route Auth: Invalid or expired app_jwt:", err.message);
        return res.status(401).json({ error: "Unauthorized: Invalid or expired session." });
    }
}

/**
 * refreshGoogleAccessToken - Function to refresh Google access token using refresh token.
 * @param {object} db - MySQL database connection pool.
 * @param {string} userId - Internal application user ID.
 * @param {string} googleRefreshToken - The refresh token obtained from Google.
 * @returns {Promise<string>} - A promise that resolves with the new access token.
 */
async function refreshGoogleAccessToken(db, userId, googleRefreshToken) {
    console.log("Attempting to refresh Google access token for user:", userId);
    try {
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
        console.log("Google access token successfully refreshed and updated in DB for user:", userId);
        return newAccessToken;
    } catch (refreshError) {
        console.error("Error refreshing Google access token for user:", userId, refreshError.message);
        throw new Error("Failed to refresh Google access token.");
    }
}

// -----------------------------------------------------------------------------
// GET /contacts/ – fetch user’s Google People connections
// -----------------------------------------------------------------------------
// This route will be mounted under /api, so the full path will be /api/contacts
router.get("/", verifyAppJwt, async (req, res) => {
    try {
        console.log("Contacts Route: Received request to fetch contacts for user:", req.userId);

        const db = req.app.locals.db;
        if (!db) {
            console.error("Contacts Route: Database instance not found in app.locals.");
            return res.status(500).json({ error: "Database not initialized." });
        }

        // Fetch user's Google tokens from MySQL
        const [userRows] = await db.execute(
            'SELECT google_id, google_access_token, google_refresh_token, access_token_expires_at FROM users WHERE id = ?',
            [req.userId]
        );

        if (userRows.length === 0) {
            console.warn("Contacts Route: User not found in database for userId:", req.userId);
            return res.status(404).json({ error: "User not found in system." });
        }

        let { google_id: googleUid, google_access_token: googleAccessToken, google_refresh_token: googleRefreshToken, access_token_expires_at: accessTokenExpiresAt } = userRows[0];

        // --- Token Refresh Logic ---
        const now = new Date();
        const expiryThreshold = 5 * 60 * 1000; // Refresh if token expires in next 5 minutes

        if (!googleAccessToken || (accessTokenExpiresAt && (new Date(accessTokenExpiresAt).getTime() - now.getTime() < expiryThreshold))) {
            if (googleRefreshToken) {
                try {
                    googleAccessToken = await refreshGoogleAccessToken(db, req.userId, googleRefreshToken);
                } catch (refreshErr) {
                    console.error("Contacts Route: Failed to refresh token, forcing re-authentication:", refreshErr.message);
                    // If refresh fails, instruct frontend to re-authenticate
                    return res.status(401).json({ error: "Google access token expired and refresh failed. Please re-authenticate." });
                }
            } else {
                console.warn("Contacts Route: No Google access token and no refresh token available. User needs to re-authenticate.");
                return res.status(401).json({ error: "Google access token missing. Please re-authenticate via login." });
            }
        }

        if (!googleAccessToken) {
            console.warn("Contacts Route: Still no valid Google access token after refresh attempt.");
            return res.status(401).json({ error: "Failed to obtain valid Google access token. Please re-authenticate." });
        }

        console.log("Contacts Route: Calling Google People API with valid access token.");
        // Call Google People API
        const { data } = await axios.get(
            "[https://people.googleapis.com/v1/people/me/connections](https://people.googleapis.com/v1/people/me/connections)",
            {
                headers: { Authorization: `Bearer ${googleAccessToken}` },
                params: {
                    personFields: "names,emailAddresses,phoneNumbers,photos,metadata",
                    pageSize: 200,
                },
            }
        );

        const connections = data.connections || [];
        const contacts = connections.map((c) => ({
            resourceName: c.resourceName,
            names: c.names,
            emailAddresses: c.emailAddresses,
            phoneNumbers: c.phoneNumbers,
            photos: c.photos,
            metadata: c.metadata
        }));

        const processedContacts = contacts.map(contact => {
            const name = contact.names && contact.names.length > 0 ? contact.names[0].displayName : "No Name";
            const email = contact.emailAddresses && contact.emailAddresses.length > 0 ? contact.emailAddresses[0].value : "No Email";
            const photo = contact.photos && contact.photos.length > 0 ? contact.photos[0].url : null;
            const phone = contact.phoneNumbers && contact.phoneNumbers.length > 0 ? contact.phoneNumbers[0].value : "No Phone";
            const lastUpdated = contact.metadata && contact.metadata.sources && contact.metadata.sources.length > 0
                ? contact.metadata.sources[0].updateTime
                : "N/A";

            return {
                id: contact.resourceName,
                name,
                email,
                photo,
                phone,
                lastUpdated,
                raw: contact
            };
        }).filter(contact => contact.name !== "No Name" || contact.email !== "No Email");

        console.log(`Contacts Route: Found ${processedContacts.length} Google contacts.`);
        return res.json(processedContacts);

    } catch (err) {
        console.error("Contacts Route: Error fetching Google contacts:", err.response?.data || err.message);
        // If Google API returns 401/403, it means Google access token is expired/invalid
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            // This case should now be handled by the refresh logic, but as a fallback
            return res.status(401).json({ error: "Google access token expired. Please re-authenticate via login." });
        }
        return res.status(500).json({ error: "Failed to fetch contacts", details: err.message });
    }
});

module.exports = router;
