// backend/controllers/emailsController.js

const { google } = require("googleapis");

/**
 * Fetches emails from Gmail API for the authenticated user.
 * Requires req.user.googleAccessToken to be set by auth middleware.
 */
exports.getEmails = async (req, res) => {
  console.log("\n--- Emails Controller: getEmails Start ---");
  console.log("Emails Controller: User ID from JWT:", req.user?.userId);
  console.log("Emails Controller: Google Access Token present:", !!req.user?.googleAccessToken);

  if (!req.user || !req.user.googleAccessToken) {
    console.error("Emails Controller: Missing user or Google access token in request.");
    return res.status(401).json({ message: "Not authenticated with Google." });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: req.user.googleAccessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // List messages (inbox, max 50)
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
    });

    const messages = listResponse.data.messages || [];
    console.log(`Emails Controller: Found ${messages.length} messages.`);

    // Fetch details for each message
    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const msgData = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });

        const headers = msgData.data.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";

        return {
          id: msg.id,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: msgData.data.snippet || "",
        };
      })
    );

    res.status(200).json(emailDetails);
    console.log("Emails Controller: Successfully sent emails response.");
  } catch (error) {
    console.error("Emails Controller: Error fetching emails:", error.message);
    if (error.code === 401 || error.code === 403) {
      return res.status(401).json({ message: "Google API authentication failed. Please re-authenticate." });
    }
    res.status(500).json({ message: "Failed to fetch emails from Google.", error: error.message });
  } finally {
    console.log("--- Emails Controller: getEmails End ---\n");
  }
};