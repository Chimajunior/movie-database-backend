const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const pool = require("../db");

// Middleware to authenticate user
const authenticateUser = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(403).json({ message: "Access Denied" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// GET /api/profile
router.get("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get basic user info
    const [[user]] = await pool.query(
      "SELECT id, username, avatar, created_at FROM users WHERE id = ?",
      [userId]
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    // Get user's reviews
    const [allReviews] = await pool.query(
      `SELECT r.*, m.title AS movie_title, m.genre, m.poster_url
       FROM reviews r
       JOIN movies m ON r.movie_id = m.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const fullReviews = allReviews.filter((r) => r.review?.trim());

    // Get ratings only
    const seen = new Set();

    const ratingOnly = allReviews
      .filter(
        (r) =>
          !r.review?.trim() &&
          r.movie_id &&
          r.movie_title &&
          r.poster_url &&
          r.rating > 0
      )
      .filter((r) => {
        // Avoid duplicates
        if (seen.has(r.movie_id)) return false;
        seen.add(r.movie_id);
        return true;
      })
      .map((r) => ({
        id: r.movie_id,
        title: r.movie_title,
        poster_url: r.poster_url,
        rating: r.rating,
        avg_rating: r.avg_rating || 0, // optional fallback
      }));

    // Get liked (helpful) reviews
    const [likedReviews] = await pool.query(
      `SELECT r.*, u.username, m.title AS movie_title, m.poster_url
       FROM review_helpful_votes v
       JOIN reviews r ON v.review_id = r.id
       JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       WHERE v.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );

    // Get watchlist
    const [watchlist] = await pool.query(
      `SELECT m.id, m.title, m.poster_url
       FROM watchlist w
       JOIN movies m ON w.movie_id = m.id
       WHERE w.user_id = ?`,
      [userId]
    );

    // Get average rating
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
      liked_reviews: likedReviews,
      watchlist,
      average_rating: avgRow?.average_rating || 0,
      
    });
  
  } catch (err) {
    console.error("Profile fetch error:", err.message);
 

    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/profile
router.put("/", authenticateUser, async (req, res) => {
  const { username, avatar } = req.body;
  try {
    await pool.query("UPDATE users SET username = ?, avatar = ? WHERE id = ?", [
      username,
      avatar,
      req.user.id,
    ]);
    res.json({ message: "Profile updated", username, avatar });
  } catch (err) {
    console.error("Profile update error:", err.message);
    res.status(500).json({ error: "Could not update profile" });
  }
});

module.exports = router;
