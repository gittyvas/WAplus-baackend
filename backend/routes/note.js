// backend/routes/note.js
const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");

// Apply authentication middleware
router.use(authenticateToken);

// GET all notes for the authenticated user
router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;

  try {
    const [rows] = await db.execute("SELECT * FROM notes WHERE user_id = ?", [userId]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching notes:", error.message);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
});

// POST a new note
router.post("/", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { title, content } = req.body;

  try {
    await db.execute("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)", [userId, title, content]);
    res.status(201).json({ message: "Note added successfully." });
  } catch (error) {
    console.error("Error adding note:", error.message);
    res.status(500).json({ error: "Failed to add note." });
  }
});

// PUT update a note
router.put("/:id", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    await db.execute(
      "UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?",
      [title, content, id, userId]
    );
    res.json({ message: "Note updated successfully." });
  } catch (error) {
    console.error("Error updating note:", error.message);
    res.status(500).json({ error: "Failed to update note." });
  }
});

// DELETE a note
router.delete("/:id", async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, userId]);
    res.json({ message: "Note deleted successfully." });
  } catch (error) {
    console.error("Error deleting note:", error.message);
    res.status(500).json({ error: "Failed to delete note." });
  }
});

module.exports = router;
