// backend/routes/contacts.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// Middleware to require authentication
const authenticateToken = require("../middleware/auth");

// Apply JWT auth to all routes in this file
router.use(authenticateToken);

// GET /api/contacts
router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: Missing user ID" });
  }

  try {
    // Get access token from database
    const [rows] = await db.execute("SELECT google_access_token FROM users WHERE id = ?", [userId]);
    const token = rows[0]?.google_access_token;

    if (!token) {
      return res.status(403).json({ error: "Google access token not found." });
    }

    // Call Google People API
    const response = await axios.get("https://people.googleapis.com/v1/people/me/connections", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        personFields: "names,emailAddresses,phoneNumbers",
        pageSize: 100
      }
    });

    // Send contacts to frontend
    res.json(response.data.connections || []);
  } catch (error) {
    console.error("Failed to fetch contacts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch contacts." });
  }
});

module.exports = router;
