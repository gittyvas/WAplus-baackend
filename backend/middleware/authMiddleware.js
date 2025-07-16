// backend/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

/**
 * Middleware to verify JWT from the `app_jwt` cookie,
 * or allow authenticated session via Passport (Google OAuth).
 */
const verifyAuthToken = (req, res, next) => {
  // ✅ Allow session-based login (e.g., Google OAuth via Passport)
  if (req.isAuthenticated?.() && req.user?.id) {
    req.userId = req.user.id;
    return next();
  }

  // ✅ Fallback to JWT-based auth via cookie
  const token = req.cookies?.app_jwt;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

module.exports = { verifyAuthToken };

