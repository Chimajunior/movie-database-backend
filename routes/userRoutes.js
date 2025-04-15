const express = require("express");
const pool = require("../db");
const { authenticateAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/users - Admin only
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      "SELECT id, username, email, role FROM users WHERE role != 'admin'"
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// public route
router.get("/:id", async (req, res) => {
    const userId = req.params.id;
  
    try {
      const [[user]] = await pool.query(
        "SELECT id, username, avatar, created_at FROM users WHERE id = ?",
        [userId]
      );
      if (!user) return res.status(404).json({ message: "User not found" });
  
      const [allReviews] = await pool.query(
        `SELECT r.*, m.title AS movie_title, m.genre, m.poster_url
         FROM reviews r
         JOIN movies m ON r.movie_id = m.id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`,
        [userId]
      );
  
      const fullReviews = allReviews.filter((r) => r.review?.trim());
      const ratingOnly = allReviews
        .filter(
          (r) =>
            !r.review?.trim() &&
            r.movie_id &&
            r.movie_title &&
            r.poster_url &&
            r.rating > 0
        )
        .map((r) => ({
          id: r.movie_id,
          title: r.movie_title,
          poster_url: r.poster_url,
          rating: r.rating,
          avg_rating: r.avg_rating || 0,
        }));
  
      const [[avgRow]] = await pool.query(
        "SELECT AVG(rating) AS average_rating FROM reviews WHERE user_id = ?",
        [userId]
      );
  
      res.json({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        joined: user.created_at,
        reviews: fullReviews,
        rating_only: ratingOnly,
        average_rating: avgRow?.average_rating || 0,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch public user data" });
    }
  });
  
module.exports = router;
