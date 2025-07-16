// backend/routes/reminders.js

const express = require('express');
const router = express.Router();

const verifyAuthToken = require('../middleware/verifyAuthToken');
const remindersController = require('../controllers/remindersController');

// ✅ Require authentication for all reminder routes
router.use(verifyAuthToken);

// ✅ Get all reminders for the authenticated user
router.get('/', remindersController.getReminders);

// ✅ Create a new reminder
router.post('/', remindersController.createReminder);

// ✅ Update an existing reminder
router.put('/:id', remindersController.updateReminder);

// ✅ Delete a reminder
router.delete('/:id', remindersController.deleteReminder);

module.exports = router;
