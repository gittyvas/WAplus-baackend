// backend/routes/profile.js

const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const verifyAuthToken = require('../middleware/verifyAuthToken'); // Middleware to get req.user and req.app_id

// Require auth for all profile routes
router.use(verifyAuthToken);

// ✅ Get user profile
router.get('/', profileController.getUserProfile);  // <-- Added for GET /api/profile

// ✅ Disconnect Google
router.post('/disconnect', profileController.disconnectGoogleAccount);

// ✅ Delete account
router.delete('/account', profileController.deleteUserAccount);

// ✅ Update notification settings
router.post('/notifications', profileController.updateNotificationSettings);

// ✅ End specific session (dummy)
router.post('/sessions/end', profileController.endSession);

module.exports = router;
