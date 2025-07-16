// backend/controllers/profileController.js

const axios = require('axios'); // Optional: For Google token revocation

// Get user profile
exports.getUserProfile = async (req, res) => {
  const userId = req.userId;
  console.log(`ProfileController: Fetching user profile for userId: ${userId}`);

  const db = req.app.locals.db;
  if (!db) {
    console.error("ProfileController: Database not initialized in app.locals.");
    return res.status(500).json({ message: "Database not initialized." });
  }

  try {
    const [rows] = await db.execute(
      `SELECT google_id, displayName, name, email, profile_picture_url, emailNotifications, pushNotifications
       FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      console.warn(`ProfileController: User not found in MySQL for ID: ${userId}`);
      return res.status(404).json({ message: 'User not found.' });
    }

    const userData = rows[0];

    const profileData = {
      name: userData.displayName || userData.name, // fallback to 'name' if displayName is null
      email: userData.email,
      profile_picture_url: userData.profile_picture_url,
      emailNotifications: userData.emailNotifications ?? true,
      pushNotifications: userData.pushNotifications ?? false,
      sessions: [] // Placeholder if sessions are tracked
    };

    res.status(200).json({ user: profileData });

  } catch (error) {
    console.error('ProfileController: Error fetching user profile from MySQL:', error);
    res.status(500).json({ message: 'Internal server error while fetching profile.' });
  }
};

// Disconnect Google account
exports.disconnectGoogleAccount = async (req, res) => {
  const userId = req.userId;
  const db = req.app.locals.db;
  console.log(`ProfileController: Attempting to disconnect Google account for user: ${userId}`);

  try {
    await db.execute(
      `UPDATE users SET
        google_access_token = NULL,
        google_refresh_token = NULL,
        access_token_expires_at = NULL,
        googleConnected = FALSE,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
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
  const userId = req.userId;
  const db = req.app.locals.db;
  console.log(`ProfileController: Attempting to delete account for user: ${userId}`);

  try {
    const [result] = await db.execute(
      `DELETE FROM users WHERE id = ?`,
      [userId]
    );

    if (result.affectedRows === 0) {
      console.warn(`ProfileController: No user found to delete for ID: ${userId}`);
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
  const userId = req.userId;
  const { emailNotifications, pushNotifications } = req.body;
  const db = req.app.locals.db;
  console.log(`ProfileController: Updating notification settings for user ${userId}: Email=${emailNotifications}, Push=${pushNotifications}`);

  try {
    const [result] = await db.execute(
      `UPDATE users SET
        emailNotifications = ?,
        pushNotifications = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [emailNotifications, pushNotifications, userId]
    );

    if (result.affectedRows === 0) {
      console.warn(`ProfileController: No user found to update notifications for ID: ${userId}`);
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
    res.status(200).json({ message: `Session ${sessionId} ended successfully (simulated).` });

  } catch (error) {
    console.error(`ProfileController: Error ending session for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to end session." });
  }
};
