// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to verify the JWT token from the session.
 * This is used to protect API routes that require authentication.
 *
 * It checks for the presence of `req.session.token` (which should be set
 * during your Google OAuth callback after successful authentication).
 * It then verifies this token using your JWT_SECRET.
 * If valid, it attaches the decoded user information (specifically the Google ID as 'id')
 * to `req.user` and calls `next()`.
 * If invalid or missing, it sends a 401 Unauthorized response.
 */
exports.verifyAuthToken = (req, res, next) => {
    // Check if the token exists in the session
    const token = req.session.token;

    if (!token) {
        console.warn('AuthMiddleware: No token found in session. Unauthorized access attempt.');
        return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }

    try {
        // Verify the token using the JWT_SECRET from environment variables
        // req.jwtSecret is attached by your app.js middleware
        const decoded = jwt.verify(token, req.jwtSecret);

        // Attach the decoded user payload to req.user
        // This payload should contain the 'id' (Google ID) and other relevant user info
        req.user = decoded;
        console.log(`AuthMiddleware: Token verified for user ID: ${req.user.id}`);
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        console.error('AuthMiddleware: Token verification failed:', error.message);
        // If token is invalid or expired
        return res.status(403).json({ message: 'Forbidden: Invalid or expired token.' });
    }
};
