// google-oauth-app/google-oauth-app/backend/routes/api.js

var express = require("express");
var router = express.Router();
// Import your JWT authentication middleware.
const authenticateToken = require("../middleware/auth"); 

// Middleware to log all API requests (optional, useful for debugging)
router.use((req, res, next) => {
  console.log(`\n--- API Route: ${req.method} ${req.originalUrl} ---`);
  next();
});

// Apply the authentication middleware to all routes defined AFTER this line.
// This ensures only authenticated users can access these API endpoints.
router.use(authenticateToken);

// --- User Profile API ---
// Protected route to fetch user profile
router.get('/user/profile', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.userId; 

    if (!userId) {
        console.warn('API Route /user/profile: No userId found on req.user after authentication.');
        return res.status(401).json({ message: 'Unauthorized: User ID not found in token.' });
    }

    try {
        // Fetch user data from your database using the userId
        const [rows] = await db.execute('SELECT id, google_id, email, name, profile_picture_url, created_at, updated_at FROM users WHERE id = ?', [userId]);

        if (rows.length === 0) {
            console.warn('API Route /user/profile: User not found in database for userId:', userId);
            return res.status(404).json({ message: 'User not found in database.' });
        }

        const userProfile = rows[0];

        // --- IMPORTANT CHANGE HERE ---
        // If you are NOT saving contacts in your MySQL database,
        // then remove the query that tries to count them from the 'contacts' table.
        // Provide a default value or calculate it differently if needed.
        const dashboardSummary = {
            totalContacts: 0, // Set to 0 or fetch from Google API if you want a real count here
            // Add other summary metrics here (e.g., total notes, total reminders from your DB)
        };

        // If you intend to fetch contacts from Google API via the backend,
        // you would do that in a *separate* API endpoint (e.g., /api/google-contacts)
        // and use req.user.googleAccessToken to make the call to Google.

        res.status(200).json({
            user: userProfile,
            dashboardSummary: dashboardSummary 
        });

    } catch (error) {
        console.error('API Route: Error fetching user profile or dashboard summary:', error);
        res.status(500).json({ message: 'Internal server error fetching user profile or dashboard data.' });
    }
});


// --- Notes API ---
// (No changes needed here, as these interact with 'notes' table)
router.get('/notes', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;

  try {
    const [rows] = await db.execute('SELECT id, user_id, content, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Failed to fetch notes.' });
  }
});

router.post('/notes', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: 'Note content is required.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO notes (user_id, content) VALUES (?, ?)',
      [userId, content]
    );
    res.status(201).json({ id: result.insertId, message: 'Note created successfully.' });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ message: 'Failed to create note.' });
  }
});

router.put('/notes/:id', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const noteId = req.params.id;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: 'Note content is required for update.' });
  }

  try {
    const [result] = await db.execute(
      'UPDATE notes SET content = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [content, noteId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Note not found or you do not have permission to update it.' });
    }
    res.status(200).json({ message: 'Note updated successfully.' });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ message: 'Failed to update note.' });
  }
});

router.delete('/notes/:id', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const noteId = req.params.id;

  try {
    const [result] = await db.execute('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Note not found or you do not have permission to delete it.' });
    }
    res.status(200).json({ message: 'Note deleted successfully.' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Failed to delete note.' });
  }
});

// --- Reminders API ---
// (No changes needed here, as these interact with 'reminders' table)
router.get('/reminders', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;

  try {
    const [rows] = await db.execute('SELECT id, user_id, title, due_date, created_at FROM reminders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ message: 'Failed to fetch reminders.' });
  }
});

router.post('/reminders', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { title, due_date } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Reminder title is required.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO reminders (user_id, title, due_date) VALUES (?, ?, ?)',
      [userId, title, due_date || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Reminder created successfully.' });
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ message: 'Failed to create reminder.' });
  }
});

router.put('/reminders/:id', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const reminderId = req.params.id;
  const { title, due_date } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Reminder title is required for update.' });
  }

  try {
    const [result] = await db.execute(
      'UPDATE reminders SET title = ?, due_date = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [title, due_date || null, reminderId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reminder not found or you do not have permission to update it.' });
    }
    res.status(200).json({ message: 'Reminder updated successfully.' });
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ message: 'Failed to update reminder.' });
  }
});

router.delete('/reminders/:id', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const reminderId = req.params.id;

  try {
    const [result] = await db.execute('DELETE FROM reminders WHERE id = ? AND user_id = ?', [reminderId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reminder not found or you do not have permission to delete it.' });
    }
    res.status(200).json({ message: 'Reminder deleted successfully.' });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ message: 'Failed to delete reminder.' });
  }
});

module.exports = router;
