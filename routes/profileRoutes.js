const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const pool = require("../db");

//  Middleware to authenticate user
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


router.get("/", authenticateUser, async (req, res) => {
  try {
    // 1. Get user info
    const [userResult] = await pool.query(
      "SELECT id, username, avatar, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = userResult[0];

    // 2. Get user's own reviews
    const [reviews] = await pool.query(
      `SELECT r.*, m.title AS movie_title 
       FROM reviews r 
       JOIN movies m ON r.movie_id = m.id 
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    // 3. Get reviews the user marked as helpful
    const [liked_reviews] = await pool.query(
      `SELECT r.*, m.title AS movie_title, u.username 
       FROM review_helpful_votes v 
       JOIN reviews r ON v.review_id = r.id 
       JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id 
       WHERE v.user_id = ?`,
      [req.user.id]
    );

    // 4. Get user's average rating
    const [avgResult] = await pool.query(
      "SELECT AVG(rating) AS average_rating FROM reviews WHERE user_id = ?",
      [req.user.id]
    );

    //  Final response
    res.json({
      ...user,
      reviews,
      liked_reviews,
      average_rating: avgResult[0].average_rating || 0,
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile - update username and avatar
router.put("/", authenticateUser, async (req, res) => {
  const { username, avatar } = req.body;
  try {
    await pool.query(
      "UPDATE users SET username = ?, avatar = ? WHERE id = ?",
      [username, avatar, req.user.id]
    );
    res.json({ message: "Profile updated successfully", username, avatar });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;









