// backend/routes/contacts.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
router.use(authenticateToken);

// GET /api/contacts?pageToken=XYZ
router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;
  const pageToken = req.query.pageToken;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: Missing user ID" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT google_access_token FROM users WHERE id = ?",
      [userId]
    );
    const token = rows[0]?.google_access_token;

    if (!token) {
      return res.status(403).json({ error: "Google access token not found." });
    }

    const response = await axios.get("https://people.googleapis.com/v1/people/me/connections", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        personFields: "names,emailAddresses,phoneNumbers",
        pageSize: 100,
        ...(pageToken && { pageToken })
      }
    });

    res.json({
      connections: response.data.connections || [],
      nextPageToken: response.data.nextPageToken || null
    });

  } catch (error) {
    console.error("Failed to fetch contacts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch contacts." });
  }
});

module.exports = router;
