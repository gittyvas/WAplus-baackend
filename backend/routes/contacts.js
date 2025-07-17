const express = require("express");
const axios = require("axios");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
router.use(authenticateToken);

// GET /api/contacts?pageToken=XYZ
router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;
  // This is the crucial part: it expects 'pageToken' from the frontend
  const pageToken = req.query.pageToken; 
  // It also accepts a 'limit' parameter, though not used in the initial example,
  // it's good practice for controlling page size.
  const limit = req.query.limit || 100; // Default to 100 if not provided

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: Missing user ID" });
  }

  try {
    // Get user's Google access token from your database
    const [rows] = await db.execute(
      "SELECT google_access_token FROM users WHERE id = ?",
      [userId]
    );
    const token = rows[0]?.google_access_token;

    if (!token) {
      return res.status(403).json({ error: "Google access token not found." });
    }

    // Call Google People API for contacts
    const response = await axios.get("https://people.googleapis.com/v1/people/me/connections", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        personFields: "names,emailAddresses,phoneNumbers,photos,metadata", // Added photos and metadata for frontend display
        pageSize: limit, // Use the 'limit' from the frontend request
        ...(pageToken && { pageToken }) // Conditionally add pageToken if it exists
      }
    });

    // Send back connections and the next page token
    res.json({
      connections: response.data.connections || [],
      nextPageToken: response.data.nextPageToken || null // This is what the frontend needs to store
    });

  } catch (error) {
    console.error("Failed to fetch contacts:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({
      error: "Failed to fetch contacts.",
      detail: error.response?.data || error.message,
    });
  }
});

module.exports = router;
