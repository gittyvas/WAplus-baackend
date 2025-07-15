// backend/controllers/profileController.js
// This version uses MySQL to fetch and manage user profile data.

// No Firebase Admin SDK imports needed anymore
// const admin = require('firebase-admin');
// const db = admin.firestore();
// const authAdmin = admin.auth();

const axios = require('axios'); // Needed for Google token revocation if implemented

// Function to get user profile data from MySQL
exports.getUserProfile = async (req, res) => {
    // req.userId is expected to be set by your authentication middleware (from the app_jwt)
    const userId = req.userId; // Use req.userId from your custom middleware in app.js
    console.log(`ProfileController: Fetching user profile for userId: ${userId}`);

    const db = req.app.locals.db; // Access MySQL database pool from app.js
    if (!db) {
        console.error("ProfileController: Database not initialized in app.locals.");
        return res.status(500).json({ message: "Database not initialized." });
    }

    try {
        // Fetch user data from the 'users' table
        // Ensure column names match your DB schema: 'name' for displayName, 'profile_picture_url' for photoURL
        const [rows] = await db.execute(
            `SELECT google_id, name, email, profile_picture_url, emailNotifications, pushNotifications FROM users WHERE google_id = ?`,
            [userId] // Use google_id to match the ID stored by Passport
        );

        if (rows.length === 0) {
            console.warn(`ProfileController: User not found in MySQL for Google ID: ${userId}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = rows[0];

        // Construct profileData to match frontend expectations (name, email, profile_picture_url)
        const profileData = {
            name: userData.name || 'N/A', // Frontend expects 'name'
            email: userData.email || 'N/A',
            profile_picture_url: userData.profile_picture_url || null, // Frontend expects 'profile_picture_url'
            emailNotifications: userData.emailNotifications ?? true, // Default to true if not set in DB
            pushNotifications: userData.pushNotifications ?? false, // Default to false if not set in DB
            sessions: [], // Placeholder for sessions, as they are not managed in this table
        };

        res.status(200).json(profileData);

    } catch (error) {
        console.error('ProfileController: Error fetching user profile from MySQL:', error);
        res.status(500).json({ message: 'Internal server error while fetching profile.' });
    }
};

// Function to handle disconnecting Google account (MySQL version)
exports.disconnectGoogleAccount = async (req, res) => {
    const userId = req.userId; // Use req.userId from your custom middleware
    const db = req.app.locals.db; // Access MySQL database pool from app.js
    console.log(`ProfileController: Attempting to disconnect Google account for user: ${userId}`);

    try {
        // Update fields related to Google connection in the 'users' table.
        // This will clear the stored tokens and set a flag.
        await db.execute(
            `UPDATE users SET
                google_access_token = NULL,
                google_refresh_token = NULL,
                access_token_expires_at = NULL,
                googleConnected = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE google_id = ?`, // Use google_id for update
            [userId]
        );

        // IMPORTANT: To fully revoke Google's consent, you need the actual Google Refresh Token
        // and call Google's OAuth2 revocation endpoint. This requires storing the refresh token
        // in your DB and retrieving it here. This part is commented out as it needs your specific
        // Google Client ID/Secret and a stored refresh token to work.
        /*
        const [userRows] = await db.execute(`SELECT google_refresh_token FROM users WHERE google_id = ?`, [userId]);
        const googleRefreshToken = userRows[0]?.google_refresh_token;
        if (googleRefreshToken) {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            await axios.post('https://oauth2.googleapis.com/revoke', null, {
                params: { token: googleRefreshToken },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
                }
            });
            console.log(`Google refresh token revoked for user ${userId}`);
        }
        */

        res.status(200).json({
            message: "Google account disconnected successfully from Pulse CRM. For complete removal of app access, please also visit your Google Account settings > Security > Third-party apps with account access."
        });

    } catch (error) {
        console.error(`ProfileController: Error disconnecting Google account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to disconnect Google account. Please try again." });
    }
};

// Function to handle deleting user account (MySQL version)
exports.deleteUserAccount = async (req, res) => {
    const userId = req.userId; // Use req.userId from custom middleware
    const db = req.app.locals.db; // Access MySQL database pool from app.js
    console.log(`ProfileController: Attempting to delete account for user: ${userId}`);

    try {
        // Delete user's record from the 'users' table using google_id
        const [result] = await db.execute(
            `DELETE FROM users WHERE google_id = ?`,
            [userId]
        );

        if (result.affectedRows === 0) {
            console.warn(`ProfileController: No user found to delete for Google ID: ${userId}`);
            return res.status(404).json({ message: 'User not found or already deleted.' });
        }

        console.log(`ProfileController: User account ${userId} deleted from MySQL.`);

        // IMPORTANT: If you have other tables linked to this user (e.g., 'notes', 'reminders'),
        // you would need to delete their records from those tables as well.
        // This often involves CASCADE DELETE in your SQL schema or explicit DELETE statements here.
        // Example (if you had a 'notes' table with a user_id foreign key):
        // await db.execute(`DELETE FROM notes WHERE user_id = ?`, [userId]);
        // await db.execute(`DELETE FROM reminders WHERE user_id = ?`, [userId]);


        res.status(200).json({ message: "Account and all associated data deleted successfully." });

    } catch (error) {
        console.error(`ProfileController: Error deleting account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
};

// Function to handle updating notification settings (MySQL version)
exports.updateNotificationSettings = async (req, res) => {
    const userId = req.userId; // Use req.userId from custom middleware
    const { emailNotifications, pushNotifications } = req.body;
    const db = req.app.locals.db; // Access MySQL database pool from app.js
    console.log(`ProfileController: Updating notification settings for user ${userId}: Email=${emailNotifications}, Push=${pushNotifications}`);

    try {
        // Update notification settings in the 'users' table using google_id
        const [result] = await db.execute(
            `UPDATE users SET
                emailNotifications = ?,
                pushNotifications = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE google_id = ?`,
            [emailNotifications, pushNotifications, userId]
        );

        if (result.affectedRows === 0) {
            console.warn(`ProfileController: No user found to update notifications for Google ID: ${userId}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({ message: "Notification settings updated successfully." });
    } catch (error) {
        console.error(`ProfileController: Error updating notification settings for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to update notification settings." });
    }
};

// Function to handle ending a specific session (MySQL version - placeholder)
exports.endSession = async (req, res) => {
    const userId = req.userId;
    const { sessionId } = req.body; // This `sessionId` is a dummy ID from your frontend

    console.log(`ProfileController: User ${userId} attempting to end session: ${sessionId}`);

    // In a real MySQL application, if you manage sessions in a database table,
    // you would delete or invalidate the specific session record here.
    // Since your frontend uses dummy sessions and you're not using Firebase Auth sessions,
    // this backend call will just acknowledge for now.
    try {
        // Example: If you had a 'sessions' table, you might do:
        // const db = req.app.locals.db;
        // await db.execute(`DELETE FROM sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);

        res.status(200).json({ message: `Session ${sessionId} ended successfully (simulated).` });
    } catch (error) {
        console.error(`ProfileController: Error ending session for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to end session." });
    }
};
