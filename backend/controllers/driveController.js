// backend/controllers/driveController.js

const { google } = require("googleapis");

/**
 * Fetches files from Google Drive API for the authenticated user.
 * Requires req.user.googleAccessToken to be set by auth middleware.
 */
exports.getFiles = async (req, res) => {
  console.log("\n--- Drive Controller: getFiles Start ---");
  console.log("Drive Controller: User ID from JWT:", req.user?.userId);
  console.log("Drive Controller: Google Access Token present:", !!req.user?.googleAccessToken);

  if (!req.user || !req.user.googleAccessToken) {
    console.error("Drive Controller: Missing user or Google access token in request.");
    return res.status(401).json({ message: "Not authenticated with Google." });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: req.user.googleAccessToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const response = await drive.files.list({
      pageSize: 100,
      fields: "files(id, name, mimeType, iconLink, modifiedTime)",
    });

    const files = response.data.files || [];
    console.log(`Drive Controller: Found ${files.length} files.`);

    res.status(200).json({ files });
    console.log("Drive Controller: Successfully sent files response.");
  } catch (error) {
    console.error("Drive Controller: Error fetching files:", error.message);
    if (error.code === 401 || error.code === 403) {
      return res.status(401).json({ message: "Google API authentication failed. Please re-authenticate." });
    }
    res.status(500).json({ message: "Failed to fetch files from Google Drive.", error: error.message });
  } finally {
    console.log("--- Drive Controller: getFiles End ---\n");
  }
};