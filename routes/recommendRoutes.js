const express = require('express');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const router = express.Router();

//  Middleware to Authenticate Users
const authenticateUser = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(403).json({ message: "Access Denied" });

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
        req.user = decoded; // Store user info for later use
        next();
    } catch (error) {
        res.status(400).json({ message: "Invalid token" });
    }
};

// Get Personalized Movie Recommendations (Content-Based)
router.get('/content-based', authenticateUser, async (req, res) => {
    const user_id = req.user.id; // Get user ID from the token

    try {
        // Step 1: Get the movies the user has rated highly
        const [userReviews] = await pool.query(
            "SELECT m.genre FROM reviews r JOIN movies m ON r.movie_id = m.id WHERE r.user_id = ? AND r.rating >= 4", 
            [user_id]
        );

        if (userReviews.length === 0) {
            return res.status(404).json({ message: "No recommendations found. Please rate more movies!" });
        }

        // Step 2: Extract genres from the user's highly-rated movies
        const genres = userReviews.map(review => review.genre);
        const uniqueGenres = [...new Set(genres)]; // Remove duplicates

        // Step 3: Recommend movies with similar genres (excluding movies already rated)
        const [recommendations] = await pool.query(
            "SELECT * FROM movies WHERE genre IN (?) AND id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?) ORDER BY RAND() LIMIT 5",
            [uniqueGenres, user_id]
        );

        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Get Personalized Movie Recommendations (Collaborative Filtering)
router.get('/collaborative', authenticateUser, async (req, res) => {
    const user_id = req.user.id;

    try {
        // Step 1: Find users with similar ratings
        const [similarUsers] = await pool.query(
            "SELECT DISTINCT r2.user_id FROM reviews r1 JOIN reviews r2 ON r1.movie_id = r2.movie_id WHERE r1.user_id = ? AND r1.rating >= 4 AND r2.user_id != ?",
            [user_id, user_id]
        );

        if (similarUsers.length === 0) {
            return res.status(404).json({ message: "No similar users found. Please rate more movies!" });
        }

        // Step 2: Get movies those similar users rated highly
        const userIds = similarUsers.map(user => user.user_id);
        const [recommendations] = await pool.query(
            "SELECT DISTINCT m.* FROM reviews r JOIN movies m ON r.movie_id = m.id WHERE r.user_id IN (?) AND r.rating >= 4 AND m.id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?) ORDER BY RAND() LIMIT 5",
            [userIds, user_id]
        );

        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
