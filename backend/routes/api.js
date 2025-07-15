// backend/routes/api.js

var express = require("express");
var router = express.Router();

// Import your authentication middleware.
const { verifyAuthToken } = require("../middleware/authMiddleware"); // Correct import path and name

// Import controllers for notes and reminders (assuming these exist or will be created)
const notesController = require("../controllers/notesController");
const remindersController = require("../controllers/remindersController");

// Middleware to log all API requests (optional, useful for debugging)
router.use((req, res, next) => {
  console.log(`\n--- API Route: ${req.method} ${req.originalUrl} ---`);
  next();
});

// Apply the authentication middleware to all routes defined AFTER this line.
// This ensures only authenticated users can access these API endpoints.
router.use(verifyAuthToken); // Use the correct middleware name

// --- Notes API ---
// These routes will be accessed as /api/notes, /api/notes/:id etc.
router.get('/notes', notesController.getNotes);
router.post('/notes', notesController.createNote);
router.put('/notes/:id', notesController.updateNote);
router.delete('/notes/:id', notesController.deleteNote);

// --- Reminders API ---
// These routes will be accessed as /api/reminders, /api/reminders/:id etc.
router.get('/reminders', remindersController.getReminders);
router.post('/reminders', remindersController.createReminder);
router.put('/reminders/:id', remindersController.updateReminder);
router.delete('/reminders/:id', remindersController.deleteReminder);

module.exports = router;
