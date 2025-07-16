// backend/controllers/profileController.js

const axios = require('axios'); // For optional Google token revocation

// Get user profile
exports.getUserProfile = async (req, res) => {
    const userId = req.userId; // This is the Google ID from Passport's deserializeUser
    console.log(`ProfileController: Fetching user profile for Google ID: ${userId}`);

    const db = req.app.locals.db;
    if (!db) {
        console.error("ProfileController: Database not initialized in app.locals.");
        return res.status(500).json({ message: "Database not initialized." });
    }

    try {
        // Use google_id in WHERE clause, and COALESCE for displayName
        const [rows] = await db.execute(
            `SELECT google_id,
                    COALESCE(displayName, name) AS name, -- Use COALESCE, and alias to 'name' for frontend
                    email,
                    profile_picture_url,
                    emailNotifications,
                    pushNotifications
             FROM users WHERE google_id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            console.warn(`ProfileController: User not found in MySQL for Google ID: ${userId}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = rows[0];

        // Ensure the response matches frontend's expectation (profile object directly)
        const profileData = {
            name: userData.name || 'N/A', // Now uses the aliased 'name'
            email: userData.email || 'N/A',
            profile_picture_url: userData.profile_picture_url || null,
            emailNotifications: userData.emailNotifications ?? true,
            pushNotifications: userData.pushNotifications ?? false,
            sessions: [] // Placeholder for sessions
        };

        res.status(200).json(profileData); // Send profileData directly, not wrapped in { user: ... }

    } catch (error) {
        console.error('ProfileController: Error fetching user profile from MySQL:', error);
        res.status(500).json({ message: 'Internal server error while fetching profile.' });
    }
};

// Disconnect Google account
exports.disconnectGoogleAccount = async (req, res) => {
    const userId = req.userId; // This is the Google ID
    const db = req.app.locals.db;
    console.log(`ProfileController: Attempting to disconnect Google account for Google ID: ${userId}`);

    try {
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

        res.status(200).json({
            message: "Google account disconnected successfully from Pulse CRM. To fully revoke access, please visit your Google Account > Security > Third-party access."
        });

    } catch (error) {
        console.error(`ProfileController: Error disconnecting Google account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to disconnect Google account. Please try again." });
    }
};

// Delete user account
exports.deleteUserAccount = async (req, res) => {
    const userId = req.userId; // This is the Google ID
    const db = req.app.locals.db;
    console.log(`ProfileController: Attempting to delete account for Google ID: ${userId}`);

    try {
        const [result] = await db.execute(
            `DELETE FROM users WHERE google_id = ?`, // Use google_id for delete
            [userId]
        );

        if (result.affectedRows === 0) {
            console.warn(`ProfileController: No user found to delete for Google ID: ${userId}`);
            return res.status(404).json({ message: 'User not found or already deleted.' });
        }

        console.log(`ProfileController: User account ${userId} deleted from MySQL.`);

        res.status(200).json({ message: "Account and all associated data deleted successfully." });

    } catch (error) {
        console.error(`ProfileController: Error deleting account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
};

// Update notification settings
exports.updateNotificationSettings = async (req, res) => {
    const userId = req.userId; // This is the Google ID
    const { emailNotifications, pushNotifications } = req.body;
    const db = req.app.locals.db;
    console.log(`ProfileController: Updating notification settings for user ${userId}: Email=${emailNotifications}, Push=${pushNotifications}`);

    try {
        const [result] = await db.execute(
            `UPDATE users SET
                emailNotifications = ?,
                pushNotifications = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE google_id = ?`, // Use google_id for update
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

// Simulate session end
exports.endSession = async (req, res) => {
    const userId = req.userId;
    const { sessionId } = req.body;

    console.log(`ProfileController: User ${userId} attempting to end session: ${sessionId}`);

    try {
        // Simulated success response (no session table)
        res.status(200).json({ message: `Session ${sessionId} ended successfully (simulated).` });

    } catch (error) {
        console.error(`ProfileController: Error ending session for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to end session." });
    }
};
