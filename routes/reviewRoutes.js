const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const router = express.Router();
const sendEmail = require('../utils/sendEmail');

// Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(403).json({ message: "Access Denied: No token" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(400).json({ message: "Invalid token" });
  }
};

const authenticateAdmin = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    console.log(" No token");
    return res.status(403).json({ message: "Access Denied: No token" });
  }

  try {
    const tokenParts = token.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      console.log(" Invalid token format");
      return res.status(403).json({ message: "Invalid token format" });
    }

    const decoded = jwt.verify(tokenParts[1], process.env.JWT_SECRET);
    console.log("Decoded Token:", decoded);

    if (!decoded || !decoded.id || decoded.role !== 'admin') {
      console.log(" Not an admin", decoded);
      return res.status(403).json({ message: "Access Denied: Admins only" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.log(" Token error", error);
    res.status(400).json({ message: "Invalid token" });
  }
};

const authenticateOptional = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    req.user = null;
  }

  next();
};

//  Post a Movie Rating or Review
router.post("/", authenticateUser, async (req, res) => {
  const { movie_id, rating, review = "" } = req.body;
  const user_id = req.user.id;

  try {
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const [movie] = await pool.query("SELECT * FROM movies WHERE id = ?", [movie_id]);
    if (movie.length === 0) {
      return res.status(404).json({ message: "Movie not found" });
    }

    const [existing] = await pool.query(
      "SELECT * FROM reviews WHERE movie_id = ? AND user_id = ?",
      [movie_id, user_id]
    );

    if (existing.length > 0) {
      const [existingReview] = existing;
      if (!existingReview.review || existingReview.review.trim() === "") {
        await pool.query("UPDATE reviews SET rating = ?, review = ? WHERE id = ?", [
          rating,
          review || "",
          existingReview.id,
        ]);
        return res.status(200).json({ message: "Rating updated." });
      }

      return res.status(409).json({ message: "You have already reviewed this movie." });
    }

    const [insert] = await pool.query(
      "INSERT INTO reviews (user_id, movie_id, rating, review, like_count) VALUES (?, ?, ?, ?, 0)",
      [user_id, movie_id, rating, review]
    );

    res.status(201).json({ message: "Review added", review_id: insert.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});





router.post('/:id/helpful', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    const [existing] = await pool.query(
      "SELECT * FROM review_helpful_votes WHERE user_id = ? AND review_id = ?",
      [user_id, id]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "You've already marked this review as helpful." });
    }

    await pool.query(
      "INSERT INTO review_helpful_votes (user_id, review_id) VALUES (?, ?)",
      [user_id, id]
    );

    res.json({ message: "Marked as helpful." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/helpful/count', async (req, res) => {
  const { id } = req.params;

  try {
    const [[count]] = await pool.query(
      "SELECT COUNT(*) AS helpfulCount FROM review_helpful_votes WHERE review_id = ?",
      [id]
    );
    res.json({ helpfulCount: count.helpfulCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});








// Get All Reviews (with only non-empty review text)
router.get("/", async (req, res) => {
  try {
    const [reviews] = await pool.query(
      `SELECT 
        r.id, 
        r.rating, 
        r.review, 
        r.created_at, 
        u.username, 
        m.id AS movie_id,           
        m.title AS movie_title, 
        m.poster_url,
        (SELECT COUNT(*) FROM review_helpful_votes WHERE review_id = r.id) AS helpful_count
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       WHERE TRIM(r.review) != ''
       ORDER BY r.created_at DESC`
    );

    if (reviews.length === 0) {
      return res.status(404).json({ message: "No reviews found" });
    }

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Update a Review (Only the Review Author Can Edit)
router.put('/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { rating, review } = req.body;
    const user_id = req.user.id; // Get the logged-in user ID from the token

    try {
        // Check if the review exists and belongs to the user
        const [existingReview] = await pool.query(
            "SELECT * FROM reviews WHERE id = ? AND user_id = ?", 
            [id, user_id]
        );

        if (existingReview.length === 0) {
            return res.status(403).json({ message: "You can only update your own reviews" });
        }

        // Validate rating (must be between 1 and 5)
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Rating must be between 1 and 5" });
        }

        // Update the review
        await pool.query(
            "UPDATE reviews SET rating = ?, review = ? WHERE id = ?", 
            [rating, review, id]
        );

        res.json({ message: "Review updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Delete a Review (Users Can Delete Their Own, Admins Can Delete Any)
router.delete('/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id; // Get the logged-in user ID
    const user_role = req.user.role; // Get the user's role (user or admin)

    try {
        // Check if the review exists
        const [existingReview] = await pool.query(
            "SELECT * FROM reviews WHERE id = ?", 
            [id]
        );

        if (existingReview.length === 0) {
            return res.status(404).json({ message: "Review not found" });
        }

        // If the user is not an admin, they can only delete their own review
        if (user_role !== 'admin' && existingReview[0].user_id !== user_id) {
            return res.status(403).json({ message: "You can only delete your own reviews" });
        }

        // Delete the review
        await pool.query("DELETE FROM reviews WHERE id = ?", [id]);

    // Log the deletion in moderation_logs
    await pool.query("INSERT INTO moderation_logs (admin_id, review_id, action) VALUES (?, ?, ?)", 
    [user_id, id, 'deleted']);

        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Get All Reviews (Admin Only)
router.get('/admin/all', authenticateUser, async (req, res) => {
    const user_role = req.user.role; // Get the role from the token

    try {
        // Check if the user is an admin
        if (user_role !== 'admin') {
            return res.status(403).json({ message: "Access Denied: Admins only" });
        }

        // Fetch all reviews from the database
        const [reviews] = await pool.query(
            "SELECT r.id, r.rating, r.review, r.created_at, u.username, m.title AS movie_title FROM reviews r JOIN users u ON r.user_id = u.id JOIN movies m ON r.movie_id = m.id ORDER BY r.created_at DESC"
        );

        if (reviews.length === 0) {
            return res.status(404).json({ message: "No reviews found" });
        }

        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



//  Flag a Review as Inappropriate & Notify Admin
router.post('/:id/flag', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id; // Get user ID from token


    try {
        // Check if review exists
        const [review] = await pool.query("SELECT * FROM reviews WHERE id = ?", [id]);
        if (review.length === 0) return res.status(404).json({ message: "Review not found" });

        // Flag the review
        await pool.query("UPDATE reviews SET flagged = TRUE WHERE id = ?", [id]);

       // Log the flagging action
       await pool.query("INSERT INTO moderation_logs (admin_id, review_id, action) VALUES (?, ?, ?)", 
        [user_id, id, 'flagged']);

        // Send Email Notification to Admin
        const adminEmail = process.env.ADMIN_EMAIL;
        const emailSubject = "🚩 Flagged Review Alert!";
        const emailText = `A review (ID: ${id}) has been flagged for moderation. Please review it at your admin panel.`;

        await sendEmail(adminEmail, emailSubject, emailText);

        res.json({ message: "Review flagged for moderation, admin notified" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Get All Flagged Reviews (Admins Only)
router.get('/flagged/all', authenticateAdmin, async (req, res) => {
    try {
        const [flaggedReviews] = await pool.query(
            "SELECT r.*, u.username FROM reviews r JOIN users u ON r.user_id = u.id WHERE flagged = TRUE"
        );

        res.json(flaggedReviews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//  Approve a Flagged Review
router.put('/:id/approve', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const admin_id = req.user.id; // Admin ID from token

  try {
      // Check if review exists
      const [review] = await pool.query("SELECT * FROM reviews WHERE id = ?", [id]);
      if (review.length === 0) return res.status(404).json({ message: "Review not found" });

      // Mark review as approved
      await pool.query("UPDATE reviews SET flagged = FALSE WHERE id = ?", [id]);

      // Log the approval
      await pool.query("INSERT INTO moderation_logs (admin_id, review_id, action) VALUES (?, ?, ?)", 
          [admin_id, id, 'approved']);

      res.json({ message: "Review approved and removed from flagged list" });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});



// Get Moderation Logs (Admins Only)
router.get('/moderation-logs', authenticateAdmin, async (req, res) => {

  try {
      const [logs] = await pool.query(`
          SELECT ml.id, ml.action, ml.timestamp, 
                 u.username AS admin, 
                 r.review, m.title AS movie_title 
          FROM moderation_logs ml
          JOIN users u ON ml.admin_id = u.id
          JOIN reviews r ON ml.review_id = r.id
          JOIN movies m ON r.movie_id = m.id
          ORDER BY ml.timestamp DESC
      `);

      res.json(logs);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Get All Rating-Only Entries
router.get("/ratings/only", async (req, res) => {
  try {
    const [ratingsOnly] = await pool.query(
      `SELECT 
        r.id, 
        r.rating, 
        r.review, 
        r.created_at, 
        u.username, 
        m.id AS movie_id,
        m.title AS movie_title, 
        m.poster_url
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       WHERE (r.review IS NULL OR TRIM(r.review) = '')
       ORDER BY r.created_at DESC`
    );

    if (ratingsOnly.length === 0) {
      return res.status(404).json({ message: "No rating-only entries found" });
    }

    res.json(ratingsOnly);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/movie/:id/user", authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const movieId = req.params.id;

  try {
    const [result] = await pool.query(
      "DELETE FROM reviews WHERE user_id = ? AND movie_id = ?",
      [userId, movieId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//  GET Popular Reviews (Most Helpful)
router.get("/popular", async (req, res) => {
  try {
    const [popular] = await pool.query(
      `SELECT 
         r.id, r.rating, r.review, r.created_at,
         u.username, u.avatar,
         m.id AS movie_id, m.title AS movie_title, m.poster_url,
         (SELECT COUNT(*) FROM review_helpful_votes WHERE review_id = r.id) AS helpful_count
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       WHERE TRIM(r.review) != ''
       ORDER BY helpful_count DESC
       LIMIT 10`
    );

    res.json(popular);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// get movies with id
router.get("/:movie_id", authenticateOptional, async (req, res) => {
  const { movie_id } = req.params;
  const user_id = req.user?.id;

  try {
    const [reviews] = await pool.query(`
      SELECT 
        r.id, r.user_id, r.rating, r.review, r.created_at, 
        u.username, u.avatar,
        (SELECT COUNT(*) FROM review_helpful_votes WHERE review_id = r.id) AS helpful_count,
        ${
          user_id
            ? `(SELECT COUNT(*) FROM review_helpful_votes WHERE review_id = r.id AND user_id = ${user_id}) AS voted`
            : `false AS voted`
        }
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.movie_id = ? AND (r.review IS NOT NULL AND r.review != '')
      ORDER BY r.created_at DESC
    `, [movie_id]);
    

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export the router
module.exports = router;
