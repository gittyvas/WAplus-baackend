// backend/routes/user.js

const express = require('express');
const router = express.Router();

// Import the profile controller which contains the getUserProfile function
const profileController = require('../controllers/profileController');

// Import your authentication middleware
// This middleware is crucial for protecting routes that require a logged-in user.
const { verifyAuthToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/user/profile
 * @description Fetches the authenticated user's profile data from the database.
 * @access Private (requires authentication)
 *
 * This route is accessed by your frontend's ProfilePage.jsx to display
 * the user's name, email, and profile picture.
 * The `verifyAuthToken` middleware ensures that only authenticated users
 * can access this endpoint.
 */
router.get('/profile', verifyAuthToken, profileController.getUserProfile);

// You can add other user-specific routes here if needed in the future.
// For example:
// router.put('/settings', verifyAuthToken, profileController.updateUserSettings);
// router.get('/dashboard-data', verifyAuthToken, dashboardController.getDashboardData);

module.exports = router;
