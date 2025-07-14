// google-oauth-app/backend/routes/contacts.js
// -----------------------------------------------------------------------------
// Contacts route – fetches Google contacts for the authenticated Pulse user.
// Uses the app_jwt (from HTTP-only cookie) for authentication,
// then looks up the stored Google *access* token in the database to call People API.
// -----------------------------------------------------------------------------

const express = require("express");
const router = express.Router();
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken"); // Import jwt for verification

// Your Google OAuth Client ID – set this in env so it works in all envs.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Use the actual client ID from env

const oauthClient = new OAuth2Client(CLIENT_ID);

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

// -----------------------------------------------------------------------------
// GET /contacts/ – fetch user’s Google People connections
// -----------------------------------------------------------------------------
// This route will be mounted under /api, so the full path will be /api/contacts
router.get("/", verifyAppJwt, async (req, res) => {
    try {
        console.log("Contacts Route: Received request to fetch contacts for user:", req.userId);

        // Firestore handle was attached to Express in app.js (assuming req.app.locals.db is Firestore)
        const db = req.app.locals.db;
        if (!db) {
            console.error("Contacts Route: Firestore DB instance not found in app.locals.");
            return res.status(500).json({ error: "Database not initialized." });
        }

        // Look up the user by the userId from the app_jwt
        // Assuming your 'users' collection/table uses the internal userId, not googleUid directly
        // If your users table uses 'google_id' as the primary key/lookup, you'd need to adjust this
        // to first find the google_id for the given userId.
        // Based on previous code, `userId` is the primary key `id` in your MySQL `users` table.
        // So we need to fetch the user from MySQL using `req.userId` to get the `google_id`
        // and then use `google_id` to fetch from Firestore (if Firestore stores by google_id).

        // Assuming your database is MySQL and `db` is a MySQL connection pool:
        const [userRows] = await db.execute('SELECT google_id, google_access_token FROM users WHERE id = ?', [req.userId]);

        if (userRows.length === 0) {
            console.warn("Contacts Route: User not found in database for userId:", req.userId);
            return res.status(404).json({ error: "User not found in system." });
        }

        const { google_id: googleUid, google_access_token: googleAccessToken } = userRows[0];

        if (!googleAccessToken) {
            console.warn("Contacts Route: Google access token not stored for user:", req.userId);
            return res.status(400).json({ error: "Google access token missing. Please re-authenticate." });
        }

        console.log("Contacts Route: Calling Google People API for Google UID:", googleUid);
        // Call Google People API
        const { data } = await axios.get(
            "[https://people.googleapis.com/v1/people/me/connections](https://people.googleapis.com/v1/people/me/connections)",
            {
                headers: { Authorization: `Bearer ${googleAccessToken}` },
                params: {
                    personFields: "names,emailAddresses,phoneNumbers,photos,metadata", // Added metadata to get updateTime
                    pageSize: 200,
                },
            }
        );

        const connections = data.connections || [];
        const contacts = connections.map((c) => ({
            resourceName: c.resourceName, // Keep resourceName for pinning
            names: c.names,
            emailAddresses: c.emailAddresses,
            phoneNumbers: c.phoneNumbers,
            photos: c.photos,
            metadata: c.metadata // Keep metadata for updateTime
        }));

        // Frontend expects processed data, so let's process it here before sending
        const processedContacts = contacts.map(contact => {
            const name = contact.names && contact.names.length > 0 ? contact.names[0].displayName : "No Name";
            const email = contact.emailAddresses && contact.emailAddresses.length > 0 ? contact.emailAddresses[0].value : "No Email";
            const photo = contact.photos && contact.photos.length > 0 ? contact.photos[0].url : null;
            const phone = contact.phoneNumbers && contact.phoneNumbers.length > 0 ? contact.phoneNumbers[0].value : "No Phone";
            const lastUpdated = contact.metadata && contact.metadata.sources && contact.metadata.sources.length > 0
                ? contact.metadata.sources[0].updateTime
                : "N/A";

            return {
                id: contact.resourceName, // Use resourceName as a unique ID for pinning
                name,
                email,
                photo,
                phone,
                lastUpdated,
                raw: contact // Keep raw data for debugging if needed
            };
        }).filter(contact => contact.name !== "No Name" || contact.email !== "No Email"); // Filter out contacts with no name or email

        console.log(`Contacts Route: Found ${processedContacts.length} Google contacts.`);
        return res.json(processedContacts);

    } catch (err) {
        console.error("Contacts Route: Error fetching Google contacts:", err.response?.data || err.message);
        // If Google API returns 401/403, it means Google access token is expired/invalid
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            return res.status(401).json({ error: "Google access token expired. Please re-authenticate via login." });
        }
        return res.status(500).json({ error: "Failed to fetch contacts", details: err.message });
    }
});

module.exports = router;
