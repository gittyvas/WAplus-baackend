// backend/routes/reminder.js
const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");

router.use(authenticateToken);

// GET all reminders
router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;

  try {
    const [rows] = await db.execute("SELECT * FROM reminders WHERE user_id = ?", [userId]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching reminders:", error.message);
    res.status(500).json({ error: "Failed to fetch reminders." });
  }
});

// POST new reminder
router.post("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { description, due_date } = req.body;

  try {
    await db.execute(
      "INSERT INTO reminders (user_id, description, due_date, completed) VALUES (?, ?, ?, false)",
      [userId, description, due_date]
    );
    res.status(201).json({ message: "Reminder created." });
  } catch (error) {
    console.error("Error creating reminder:", error.message);
    res.status(500).json({ error: "Failed to create reminder." });
  }
});

// PUT update reminder completion or text
router.put("/:id", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { id } = req.params;
  const { description, due_date, completed } = req.body;

  try {
    await db.execute(
      "UPDATE reminders SET description = ?, due_date = ?, completed = ? WHERE id = ? AND user_id = ?",
      [description, due_date, completed, id, userId]
    );
    res.json({ message: "Reminder updated." });
  } catch (error) {
    console.error("Error updating reminder:", error.message);
    res.status(500).json({ error: "Failed to update reminder." });
  }
});

// DELETE reminder
router.delete("/:id", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await db.execute("DELETE FROM reminders WHERE id = ? AND user_id = ?", [id, userId]);
    res.json({ message: "Reminder deleted." });
  } catch (error) {
    console.error("Error deleting reminder:", error.message);
    res.status(500).json({ error: "Failed to delete reminder." });
  }
});

module.exports = router;
