// backend/controllers/profileController.js
const admin = require('firebase-admin'); // Firebase Admin SDK is already initialized in app.js
const db = admin.firestore(); // Get Firestore instance
const authAdmin = admin.auth(); // Get Auth instance

// Function to get user profile data
// Renamed from getProfile to getUserProfile as requested
exports.getUserProfile = async (req, res) => {
    try {
        const userId = req.user.uid; // User ID from your authentication middleware
        const appId = req.app_id; // App ID from your middleware

        // Fetch user data from Firestore
        const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(userId);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            // If user document doesn't exist in Firestore, but they are authenticated,
            // it means they might be a new user or their data hasn't been synced yet.
            // You can return basic info from Firebase Auth if available.
            const firebaseUser = await authAdmin.getUser(userId);
            const profileData = {
                name: firebaseUser.displayName || 'N/A', // Renamed to 'name' for frontend
                email: firebaseUser.email || 'N/A',
                profile_picture_url: firebaseUser.photoURL || null, // Renamed to 'profile_picture_url' for frontend
                // Add any other default fields or info you want to send
                emailNotifications: true, // Default if not in Firestore
                pushNotifications: false, // Default if not in Firestore
                sessions: [], // Default empty array for sessions
            };
            return res.status(200).json(profileData);
        }

        const userData = userDoc.data();
        // Filter out sensitive data before sending to the frontend
        const profileData = {
            name: userData.displayName || 'N/A', // Renamed to 'name' for frontend
            email: userData.email || 'N/A',
            profile_picture_url: userData.photoURL || null, // Renamed to 'profile_picture_url' for frontend
            // Include notification settings if stored here
            emailNotifications: userData.notificationSettings?.email ?? true, // Default to true if not set
            pushNotifications: userData.notificationSettings?.push ?? false, // Default to false if not set
            // Assuming sessions might be stored directly or fetched separately if needed
            sessions: userData.sessions || [], // Include sessions if stored in user doc
        };

        res.status(200).json(profileData);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        // If getUser fails (e.g., user not found in Firebase Auth), or other errors
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: 'User not found in authentication system.' });
        }
        res.status(500).json({ message: 'Internal server error while fetching profile.' });
    }
};


// Function to handle disconnecting Google account
exports.disconnectGoogleAccount = async (req, res) => {
    // `req.user.uid` is expected to be set by your `verifyAuthToken` middleware
    const userId = req.user.uid;
    // `req.app_id` is expected to be set by a middleware (or derived from env)
    const appId = req.app_id;
    console.log(`Attempting to disconnect Google account for user: ${userId} in app: ${appId}`);

    try {
        // IMPORTANT: For a full Google account disconnect, you would typically:
        // 1. Have stored the Google Access Token and Refresh Token on your backend.
        // 2. Call Google's OAuth2 API (e.g., `https://oauth2.googleapis.com/revoke`)
        //    to revoke the tokens directly.
        // Firebase Admin SDK's `revokeRefreshTokens` logs the user out of all Firebase sessions,
        // but doesn't directly revoke the Google OAuth consent.
        // The message below guides the user to Google's own settings.

        // Update a flag in Firestore to indicate disconnection status
        const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(userId);
        await userDocRef.set({
            googleConnected: false, // Set a flag indicating disconnection
            googleDisconnectTimestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }); // Use merge to only update this field without overwriting others

        res.status(200).json({
            message: "Google account disconnect initiated. For complete removal of app access, please also visit your Google Account settings > Security > Third-party apps with account access."
        });

    } catch (error) {
        console.error(`Error disconnecting Google account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to disconnect Google account. Please try again." });
    }
};

// Function to handle deleting user account
exports.deleteUserAccount = async (req, res) => {
    const userId = req.user.uid; // User ID from authenticated request
    const appId = req.app_id;
    console.log(`Attempting to delete account for user: ${userId} in app: ${appId}`);

    try {
        // 1. Delete user from Firebase Authentication
        await authAdmin.deleteUser(userId);
        console.log(`Firebase Auth user ${userId} deleted.`);

        // 2. Delete all user-specific data from Firestore
        // IMPORTANT: Firestore does NOT natively support recursive deletes for subcollections
        // directly via client/admin SDKs. For production, you should implement a
        // Firebase Cloud Function to handle recursive deletion of subcollections
        // (like 'pinnedContacts', 'notes', 'reminders') when the user's main document is deleted.
        // The code below provides a basic example for a single subcollection,
        // but for complex data structures, a Cloud Function is highly recommended.

        const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(userId);

        // Example: Delete pinnedContacts subcollection (simplified, for demonstration)
        const pinnedContactsSnapshot = await userDocRef.collection('pinnedContacts').get();
        const deletePinnedPromises = [];
        pinnedContactsSnapshot.docs.forEach(doc => {
            deletePinnedPromises.push(doc.ref.delete());
        });
        await Promise.all(deletePinnedPromises);
        console.log(`Deleted pinned contacts for user ${userId}.`);

        // Add similar loops for other subcollections like 'notes', 'reminders' etc.
        // const notesSnapshot = await userDocRef.collection('notes').get();
        // const deleteNotesPromises = [];
        // notesSnapshot.docs.forEach(doc => deleteNotesPromises.push(doc.ref.delete()));
        // await Promise.all(deleteNotesPromises);

        // Finally, delete the user's main document
        await userDocRef.delete();
        console.log(`User document ${userId} deleted from Firestore.`);

        res.status(200).json({ message: "Account and all associated data deleted successfully." });

    } catch (error) {
        console.error(`Error deleting account for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
};

// Function to handle updating notification settings
exports.updateNotificationSettings = async (req, res) => {
    const userId = req.user.uid;
    const appId = req.app_id;
    const { emailNotifications, pushNotifications } = req.body;
    console.log(`Updating notification settings for user ${userId} in app ${appId}: Email=${emailNotifications}, Push=${pushNotifications}`);

    try {
        const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(userId);
        await userDocRef.set({
            notificationSettings: {
                email: emailNotifications,
                push: pushNotifications,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }); // Use merge to only update specified fields

        res.status(200).json({ message: "Notification settings updated successfully." });
    } catch (error) {
        console.error(`Error updating notification settings for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to update notification settings." });
    }
};

// Function to handle ending a specific session (simplified for demonstration)
exports.endSession = async (req, res) => {
    const userId = req.user.uid;
    const appId = req.app_id;
    const { sessionId } = req.body; // This `sessionId` is a dummy ID from your frontend

    console.log(`User ${userId} in app ${appId} attempting to end session: ${sessionId}`);

    try {
        // In a real application, if you manage sessions on the backend (e.g., in Firestore),
        // you would delete the specific session document here.
        // If you're using Firebase Auth session cookies, revoking refresh tokens
        // (authAdmin.revokeRefreshTokens(userId)) would log the user out of all devices.
        // Since your frontend uses dummy sessions, this backend call will just acknowledge.

        res.status(200).json({ message: `Session ${sessionId} ended successfully (simulated).` });
    } catch (error) {
        console.error(`Error ending session for user ${userId}:`, error);
        res.status(500).json({ error: "Failed to end session." });
    }
};
