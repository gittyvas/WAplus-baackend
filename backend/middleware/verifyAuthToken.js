// backend/middleware/verifyAuthToken.js

const jwt = require('jsonwebtoken');

module.exports = function verifyAuthToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'No token provided. Unauthorized.' });
  }

  try {
    const decoded = jwt.verify(token, req.jwtSecret);
    req.user = {
      uid: decoded.userId, // `userId` is what you stored in the token
    };
    next();
  } catch (err) {
    console.error('Invalid JWT:', err);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
