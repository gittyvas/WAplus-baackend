// backend/routes/notes.js

const express = require('express');
const router = express.Router();
const notesController = require('../controllers/notesController');
const verifyAuthToken = require('../middleware/verifyAuthToken');

// ✅ Apply JWT auth middleware to all note routes
router.use(verifyAuthToken);

// ✅ Fetch all notes for the user
router.get('/', notesController.getNotes);

// ✅ Create a new note
router.post('/', notesController.createNote);

// ✅ Update an existing note
router.put('/:id', notesController.updateNote);

// ✅ Delete a note
router.delete('/:id', notesController.deleteNote);

module.exports = router;
