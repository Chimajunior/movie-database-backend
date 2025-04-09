const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const router = express.Router();

// Auth middleware
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(403).json({ message: "Access denied" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Get watchlist for logged-in user
router.get("/", authenticateUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*
       FROM watchlist w
       JOIN movies m ON w.movie_id = m.id
       WHERE w.user_id = ?`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⭐ Check if specific movie is in watchlist
router.get("/:movieId", authenticateUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?`,
      [req.user.id, req.params.movieId]
    );
    res.json({ inWatchlist: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➕ Add movie to watchlist
router.post("/", authenticateUser, async (req, res) => {
  const { movie_id } = req.body;

  try {
    // Check if already added
    const [exists] = await pool.query(
      "SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?",
      [req.user.id, movie_id]
    );
    if (exists.length > 0) {
      return res.status(409).json({ message: "Already in watchlist" });
    }

    await pool.query(
      "INSERT INTO watchlist (user_id, movie_id) VALUES (?, ?)",
      [req.user.id, movie_id]
    );
    res.status(201).json({ message: "Movie added to watchlist" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove movie from watchlist
router.delete("/:movieId", authenticateUser, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?",
      [req.user.id, req.params.movieId]
    );
    res.json({ message: "Movie removed from watchlist" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watchlist/toggle
router.post("/toggle", authenticateUser, async (req, res) => {
    const { movie_id } = req.body;
    const userId = req.user.id;
  
    try {
      const [existing] = await pool.query(
        "SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ?",
        [userId, movie_id]
      );
  
      if (existing.length > 0) {
        // Remove from watchlist
        await pool.query(
          "DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?",
          [userId, movie_id]
        );
        return res.json({ inWatchlist: false });
      } else {
        // Add to watchlist
        await pool.query(
          "INSERT INTO watchlist (user_id, movie_id) VALUES (?, ?)",
          [userId, movie_id]
        );
        return res.json({ inWatchlist: true });
      }
    } catch (error) {
      console.error("Watchlist toggle error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  });
  
  module.exports = router;
