// backend/routes/photos.js

const express = require("express");
const router = express.Router();
const { verifyAuthToken } = require("../middleware/authMiddleware");
const photosController = require("../controllers/photosController");

router.use(verifyAuthToken);

router.use(async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: Missing user ID" });
    }
    const [rows] = await db.execute(
      "SELECT google_access_token FROM users WHERE id = ?",
      [userId]
    );
    if (!rows[0]?.google_access_token) {
      return res.status(403).json({ message: "Google access token not found." });
    }
    req.user = req.user || {};
    req.user.userId = userId;
    req.user.googleAccessToken = rows[0].google_access_token;
    next();
  } catch (err) {
    console.error("Photos route middleware error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", photosController.getPhotos);

module.exports = router;