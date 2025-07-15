// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const verifyAuthToken = require('../middleware/verifyAuthToken'); // Authentication middleware

// ✅ Apply authentication middleware to all profile routes
router.use(verifyAuthToken);

// ✅ Route to fetch user profile (used in frontend/Profile.jsx)
router.get('/user/profile', profileController.getUserProfile);

// ✅ Route to disconnect Google account
router.post('/profile/disconnect', profileController.disconnectGoogleAccount);

// ✅ Route to delete user account
router.delete('/profile/account', profileController.deleteUserAccount);

// ✅ Route to update notification settings
router.post('/profile/notifications', profileController.updateNotificationSettings);

// ✅ Route to end a specific session
router.post('/profile/sessions/end', profileController.endSession);

module.exports = router;
