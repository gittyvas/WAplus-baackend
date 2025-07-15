// backend/routes/api.js

const express = require("express");
const router = express.Router();

// Auth middleware (JWT-based)
const { verifyAuthToken } = require("../middleware/authMiddleware");

// You can import other controllers here, like notes or reminders
const notesController = require("../controllers/notesController");
const remindersController = require("../controllers/remindersController");

// Apply auth middleware to all /api routes
router.use(verifyAuthToken);

// Example API routes (adjust to your app's needs)
router.get("/notes", notesController.getNotes);
router.post("/notes", notesController.createNote);
router.put("/notes/:id", notesController.updateNote);
router.delete("/notes/:id", notesController.deleteNote);

router.get("/reminders", remindersController.getReminders);
router.post("/reminders", remindersController.createReminder);
router.put("/reminders/:id", remindersController.updateReminder);
router.delete("/reminders/:id", remindersController.deleteReminder);

// ✅ Very important
module.exports = router;
