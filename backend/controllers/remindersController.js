// backend/controllers/remindersController.js

// Function to get reminders for the authenticated user
exports.getReminders = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId

    try {
        const [rows] = await db.execute('SELECT id, user_id, title, due_date, created_at FROM reminders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('RemindersController: Error fetching reminders:', error);
        res.status(500).json({ message: 'Failed to fetch reminders.' });
    }
};

// Function to create a new reminder
exports.createReminder = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
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
        console.error('RemindersController: Error creating reminder:', error);
        res.status(500).json({ message: 'Failed to create reminder.' });
    }
};

// Function to update an existing reminder
exports.updateReminder = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
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
        console.error('RemindersController: Error updating reminder:', error);
        res.status(500).json({ message: 'Failed to update reminder.' });
    }
};

// Function to delete a reminder
exports.deleteReminder = async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId; // Use req.userId
    const reminderId = req.params.id;

    try {
        const [result] = await db.execute('DELETE FROM reminders WHERE id = ? AND user_id = ?', [reminderId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Reminder not found or you do not have permission to delete it.' });
        }
        res.status(200).json({ message: 'Reminder deleted successfully.' });
    } catch (error) {
        console.error('RemindersController: Error deleting reminder:', error);
        res.status(500).json({ message: 'Failed to delete reminder.' });
    }
};
