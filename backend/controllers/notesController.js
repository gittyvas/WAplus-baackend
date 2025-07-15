// backend/controllers/notesController.js

// Function to get notes for the authenticated user
exports.getNotes = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId

    try {
        const [rows] = await db.execute('SELECT id, user_id, content, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('NotesController: Error fetching notes:', error);
        res.status(500).json({ message: 'Failed to fetch notes.' });
    }
};

// Function to create a new note
exports.createNote = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
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
        console.error('NotesController: Error creating note:', error);
        res.status(500).json({ message: 'Failed to create note.' });
    }
};

// Function to update an existing note
exports.updateNote = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
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
        console.error('NotesController: Error updating note:', error);
        res.status(500).json({ message: 'Failed to update note.' });
    }
};

// Function to delete a note
exports.deleteNote = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
    const noteId = req.params.id;

    try {
        const [result] = await db.execute('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Note not found or you do not have permission to delete it.' });
        }
        res.status(200).json({ message: 'Note deleted successfully.' });
    } catch (error) {
        console.error('NotesController: Error deleting note:', error);
        res.status(500).json({ message: 'Failed to delete note.' });
    }
};
