// backend/controllers/profileController.js

exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.uid;
    const db = req.app.locals.db;

    const [rows] = await db.execute(
      'SELECT name, email, profile_picture_url, email_notifications, push_notifications FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found in database.' });
    }

    const user = rows[0];
    res.status(200).json({
      name: user.name,
      email: user.email,
      profile_picture_url: user.profile_picture_url,
      emailNotifications: user.email_notifications === 1,
      pushNotifications: user.push_notifications === 1,
      sessions: [], // Optional placeholder
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Failed to fetch user profile.' });
  }
};

exports.disconnectGoogleAccount = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.user.uid;

    await db.execute(
      'UPDATE users SET google_connected = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );

    res.status(200).json({
      message:
        'Google account disconnected. To fully revoke access, visit your Google Account > Security > Third-party access.',
    });
  } catch (err) {
    console.error('Error disconnecting Google account:', err);
    res.status(500).json({ error: 'Failed to disconnect Google account.' });
  }
};

exports.deleteUserAccount = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.user.uid;

    // Optional: Delete related data from other tables first
    await db.execute('DELETE FROM pinned_contacts WHERE user_id = ?', [userId]);
    await db.execute('DELETE FROM reminders WHERE user_id = ?', [userId]);
    await db.execute('DELETE FROM notes WHERE user_id = ?', [userId]);

    // Delete user last
    await db.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.status(200).json({ message: 'Account and data deleted successfully.' });
  } catch (err) {
    console.error('Error deleting account:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
};

exports.updateNotificationSettings = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.user.uid;
    const { emailNotifications, pushNotifications } = req.body;

    await db.execute(
      'UPDATE users SET email_notifications = ?, push_notifications = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [emailNotifications ? 1 : 0, pushNotifications ? 1 : 0, userId]
    );

    res.status(200).json({ message: 'Notification settings updated.' });
  } catch (err) {
    console.error('Error updating notification settings:', err);
    res.status(500).json({ error: 'Failed to update notification settings.' });
  }
};

exports.endSession = async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    console.log(`Simulated end of session ${sessionId}`);
    res.status(200).json({ message: `Session ${sessionId} ended (simulated).` });
  } catch (err) {
    console.error('Error ending session:', err);
    res.status(500).json({ error: 'Failed to end session.' });
  }
};
