// backend/controllers/contactsController.js

const { google } = require("googleapis");
require("dotenv").config();

const BATCH_SIZE = 100; // Insert contacts in batches for better performance
const PAGE_SIZE = 1000; // Google API page size

/**
 * Fetches ALL contacts from Google People API (handles pagination)
 * and saves them to the database.
 */
exports.syncContacts = async (req, res) => {
  console.log("\n--- Contacts Controller: syncContacts Start ---");
  console.log("User ID:", req.user?.userId);

  if (!req.user || !req.user.googleAccessToken) {
    console.error("Missing user or Google access token");
    return res.status(401).json({
      success: false,
      error: "GOOGLE_AUTH_REQUIRED",
      message: "Not authenticated with Google. Please reconnect your Google account.",
    });
  }

  const db = req.app.locals.db;
  if (!db) {
    console.error("Database not initialized");
    return res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Database connection not available.",
    });
  }

  const userId = req.user.userId;
  let totalFetched = 0;
  let totalSaved = 0;
  let pageToken = null;

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: req.user.googleAccessToken });

    const people = google.people({
      version: "v1",
      auth: oauth2Client,
    });

    const allContacts = [];

    // Fetch all pages of contacts
    do {
      const response = await people.people.connections.list({
        resourceName: "people/me",
        personFields: "names,emailAddresses,phoneNumbers,photos,organizations,biographies",
        pageSize: PAGE_SIZE,
        pageToken: pageToken || undefined,
      });

      const connections = response.data.connections || [];
      totalFetched += connections.length;
      pageToken = response.data.nextPageToken || null;

      for (const contact of connections) {
        allContacts.push({
          googleContactId: contact.resourceName || null,
          name: contact.names?.[0]?.displayName || null,
          email: contact.emailAddresses?.[0]?.value || null,
          phone: contact.phoneNumbers?.[0]?.value || null,
          photoUrl: contact.photos?.[0]?.url || null,
          company: contact.organizations?.[0]?.name || null,
          jobTitle: contact.organizations?.[0]?.title || null,
          notes: contact.biographies?.[0]?.value || null,
        });
      }

      console.log(`Fetched page: ${connections.length} contacts (total: ${totalFetched})`);
    } while (pageToken);

    console.log(`Total contacts fetched from Google: ${totalFetched}`);

    // Save contacts in batches
    const syncTimestamp = new Date();

    for (let i = 0; i < allContacts.length; i += BATCH_SIZE) {
      const batch = allContacts.slice(i, i + BATCH_SIZE);

      const values = batch.map((c) => [
        userId,
        c.googleContactId,
        c.name,
        c.email,
        c.phone,
        c.photoUrl,
        c.company,
        c.jobTitle,
        c.notes,
        syncTimestamp,
      ]);

      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      await db.execute(
        `INSERT INTO contacts 
         (user_id, google_contact_id, name, email, phone, photo_url, company, job_title, notes, last_synced_at)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           email = VALUES(email),
           phone = VALUES(phone),
           photo_url = VALUES(photo_url),
           company = VALUES(company),
           job_title = VALUES(job_title),
           notes = VALUES(notes),
           last_synced_at = VALUES(last_synced_at),
           updated_at = NOW()`,
        values.flat()
      );

      totalSaved += batch.length;
      console.log(`Saved batch: ${batch.length} contacts (total saved: ${totalSaved})`);
    }

    // Clean up contacts that no longer exist in Google
    const googleIds = allContacts
      .map((c) => c.googleContactId)
      .filter((id) => id !== null);

    if (googleIds.length > 0) {
      const placeholders = googleIds.map(() => "?").join(", ");
      const [deleteResult] = await db.execute(
        `DELETE FROM contacts 
         WHERE user_id = ? 
         AND google_contact_id IS NOT NULL 
         AND google_contact_id NOT IN (${placeholders})`,
        [userId, ...googleIds]
      );
      console.log(`Removed ${deleteResult.affectedRows} stale contacts`);
    }

    console.log("--- Contacts Controller: syncContacts End ---\n");

    res.status(200).json({
      success: true,
      message: "Contacts synced successfully",
      data: {
        totalFetched,
        totalSaved,
        syncedAt: syncTimestamp.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error syncing contacts:", error.message);

    if (error.code === 401 || error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: "GOOGLE_TOKEN_EXPIRED",
        message: "Google access token expired. Please re-authenticate.",
      });
    }

    if (error.code === 403 || error.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error: "GOOGLE_PERMISSION_DENIED",
        message: "Permission denied. Please grant contacts access.",
      });
    }

    if (error.code === 429 || error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      });
    }

    res.status(500).json({
      success: false,
      error: "SYNC_FAILED",
      message: "Failed to sync contacts from Google.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Gets contacts from database with pagination, search, and filtering.
 */
exports.getContacts = async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const sortBy = ["name", "email", "created_at", "updated_at"].includes(req.query.sortBy)
      ? req.query.sortBy
      : "name";
    const sortOrder = req.query.sortOrder?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    const favoritesOnly = req.query.favorites === "true";

    let whereClause = "WHERE user_id = ?";
    const params = [userId];

    if (search) {
      whereClause += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (favoritesOnly) {
      whereClause += " AND is_favorite = TRUE";
    }

    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM contacts ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated results
    const [rows] = await db.execute(
      `SELECT 
        id,
        google_contact_id,
        name,
        email,
        phone,
        photo_url,
        company,
        job_title,
        notes,
        is_favorite,
        last_synced_at,
        created_at,
        updated_at
       FROM contacts
       ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        contacts: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + rows.length < total,
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error.message);
    res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to fetch contacts.",
    });
  }
};

/**
 * Get a single contact by ID.
 */
exports.getContactById = async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;
  const contactId = parseInt(req.params.id);

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  if (isNaN(contactId)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_ID",
      message: "Invalid contact ID.",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT * FROM contacts WHERE id = ? AND user_id = ?`,
      [contactId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Contact not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Failed to fetch contact:", error.message);
    res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to fetch contact.",
    });
  }
};

/**
 * Update a contact (local fields only - notes, favorite status).
 */
exports.updateContact = async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;
  const contactId = parseInt(req.params.id);
  const { notes, is_favorite } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  if (isNaN(contactId)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_ID",
      message: "Invalid contact ID.",
    });
  }

  try {
    // Verify ownership
    const [existing] = await db.execute(
      `SELECT id FROM contacts WHERE id = ? AND user_id = ?`,
      [contactId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Contact not found.",
      });
    }

    const updates = [];
    const values = [];

    if (notes !== undefined) {
      updates.push("notes = ?");
      values.push(notes);
    }

    if (is_favorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(Boolean(is_favorite));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "NO_UPDATES",
        message: "No valid fields to update.",
      });
    }

    values.push(contactId, userId);

    await db.execute(
      `UPDATE contacts SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      values
    );

    // Fetch updated contact
    const [rows] = await db.execute(
      `SELECT * FROM contacts WHERE id = ? AND user_id = ?`,
      [contactId, userId]
    );

    res.status(200).json({
      success: true,
      message: "Contact updated successfully",
      data: rows[0],
    });
  } catch (error) {
    console.error("Failed to update contact:", error.message);
    res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to update contact.",
    });
  }
};

/**
 * Delete a contact.
 */
exports.deleteContact = async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;
  const contactId = parseInt(req.params.id);

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  if (isNaN(contactId)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_ID",
      message: "Invalid contact ID.",
    });
  }

  try {
    const [result] = await db.execute(
      `DELETE FROM contacts WHERE id = ? AND user_id = ?`,
      [contactId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Contact not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Contact deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete contact:", error.message);
    res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to delete contact.",
    });
  }
};

/**
 * Get sync status for the user.
 */
exports.getSyncStatus = async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  try {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM contacts WHERE user_id = ?`,
      [userId]
    );

    const [lastSyncResult] = await db.execute(
      `SELECT MAX(last_synced_at) as lastSync FROM contacts WHERE user_id = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        totalContacts: countResult[0].total,
        lastSyncedAt: lastSyncResult[0].lastSync,
      },
    });
  } catch (error) {
    console.error("Failed to get sync status:", error.message);
    res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to get sync status.",
    });
  }
};
