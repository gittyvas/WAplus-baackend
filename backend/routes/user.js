// backend/routes/user.js

const express = require('express');
const router = express.Router();

// Import the profile controller
const profileController = require('../controllers/profileController');

// Auth middleware
const { verifyAuthToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/user/profile
 */
router.get('/profile', verifyAuthToken, profileController.getUserProfile);

/**
 * @route POST /api/user/disconnect
 */
router.post('/disconnect', verifyAuthToken, profileController.disconnectGoogleAccount);

/**
 * @route DELETE /api/user/account
 */
router.delete('/account', verifyAuthToken, profileController.deleteUserAccount);

/**
 * @route POST /api/user/notifications
 */
router.post('/notifications', verifyAuthToken, profileController.updateNotificationSettings);

/**
 * @route POST /api/user/session/end
 */
router.post('/session/end', verifyAuthToken, profileController.endSession);

module.exports = router;
