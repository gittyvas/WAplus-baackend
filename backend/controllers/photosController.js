// backend/controllers/photosController.js

const axios = require("axios");

/**
 * Fetches photos from Google Photos Library API for the authenticated user.
 * Requires req.user.googleAccessToken to be set by auth middleware.
 */
exports.getPhotos = async (req, res) => {
  console.log("\n--- Photos Controller: getPhotos Start ---");
  console.log("Photos Controller: User ID from JWT:", req.user?.userId);
  console.log("Photos Controller: Google Access Token present:", !!req.user?.googleAccessToken);

  if (!req.user || !req.user.googleAccessToken) {
    console.error("Photos Controller: Missing user or Google access token in request.");
    return res.status(401).json({ message: "Not authenticated with Google." });
  }

  try {
    const response = await axios.get(
      "https://photoslibrary.googleapis.com/v1/mediaItems",
      {
        headers: {
          Authorization: `Bearer ${req.user.googleAccessToken}`,
        },
        params: {
          pageSize: 100,
        },
      }
    );

    const mediaItems = response.data.mediaItems || [];
    console.log(`Photos Controller: Found ${mediaItems.length} photos.`);

    res.status(200).json({ mediaItems });
    console.log("Photos Controller: Successfully sent photos response.");
  } catch (error) {
    console.error("Photos Controller: Error fetching photos:", error.response?.data || error.message);
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ message: "Google API authentication failed. Please re-authenticate." });
    }
    res.status(500).json({ message: "Failed to fetch photos from Google.", error: error.message });
  } finally {
    console.log("--- Photos Controller: getPhotos End ---\n");
  }
};