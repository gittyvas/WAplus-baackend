const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const pool = require("../config/database");
const authMiddleware = require("../middleware/auth");

router.get("/google", authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT google_access_token FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!users.length || !users[0].google_access_token) {
      return res.status(401).json({ error: "Google account not connected" });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: users[0].google_access_token,
    });

    const peopleService = google.people({ version: "v1", auth: oauth2Client });

    let allContacts = [];
    let nextPageToken = null;

    // fetch all contacts with pagination
    do {
      const response = await peopleService.people.connections.list({
        resourceName: "people/me",
        pageSize: 100,
        pageToken: nextPageToken,
        personFields: "names,emailAddresses,phoneNumbers,photos,organizations,biographies",
      });

      const connections = response.data.connections || [];
      allContacts = allContacts.concat(connections);
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    // save contacts to database
    for (const person of allContacts) {
      const googleContactId = person.resourceName;
      const name = person.names?.[0]?.displayName || null;
      const email = person.emailAddresses?.[0]?.value || null;
      const phone = person.phoneNumbers?.[0]?.value || null;
      const photoUrl = person.photos?.[0]?.url || null;
      const company = person.organizations?.[0]?.name || null;
      const jobTitle = person.organizations?.[0]?.title || null;
      const notes = person.biographies?.[0]?.value || null;

      await pool.execute(
        `INSERT INTO contacts 
         (user_id, google_contact_id, name, email, phone, photo_url, company, job_title, notes, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         email = VALUES(email),
         phone = VALUES(phone),
         photo_url = VALUES(photo_url),
         company = VALUES(company),
         job_title = VALUES(job_title),
         notes = VALUES(notes),
         last_synced_at = NOW()`,
        [req.user.id, googleContactId, name, email, phone, photoUrl, company, jobTitle, notes]
      );
    }

    // fetch saved contacts from database to return
    const [savedContacts] = await pool.execute(
      "SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC",
      [req.user.id]
    );

    res.json({
      contacts: savedContacts,
      total: savedContacts.length,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing contacts:", error);
    res.status(500).json({ error: "Failed to sync contacts" });
  }
});

// get contacts from database (no google fetch)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [contacts] = await pool.execute(
      "SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC",
      [req.user.id]
    );
    res.json({ contacts, total: contacts.length });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

module.exports = router;
