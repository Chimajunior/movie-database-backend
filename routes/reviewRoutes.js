const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const router = express.Router();
const sendEmail = require('../utils/sendEmail');


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

//  Middleware to Check If User Is an Admin
const authenticateAdmin = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(403).json({ message: "Access Denied: No token provided" });

    try {
       // Ensure token starts with "Bearer "
       const tokenParts = token.split(" ");
       if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
           return res.status(403).json({ message: "Invalid token format" });
       }

        const decoded = jwt.verify(tokenParts[1], process.env.JWT_SECRET);
        
  //  Ensure user exists in the token and is an admin
  if (!decoded || !decoded.id || decoded.role !== 'admin') {
    return res.status(403).json({ message: "Access Denied: Admins only" });
}
req.user = decoded; //  Store user info in `req.user`

        next();
    } catch (error) {
        res.status(400).json({ message: "Invalid token" });
    }
};


//  Post a Movie Review (Logged-in Users Only)
router.post("/", authenticateUser, async (req, res) => {
  const { movie_id, rating, review } = req.body;
  const user_id = req.user.id; // Get user ID from decoded token

  try {
    // Check if the movie exists
    const [movie] = await pool.query("SELECT * FROM movies WHERE id = ?", [
      movie_id,
    ]);
    if (movie.length === 0)
      return res.status(404).json({ message: "Movie not found" });

    // Validate rating (1 to 5 only)
    if (rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5" });
    }

    // Insert the review into the database
    await pool.query(
      "INSERT INTO reviews (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?)",
      [user_id, movie_id, rating, review]
    );

    res.status(201).json({ message: "Review added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//  Get All Reviews for a Specific Movie
router.get("/:movie_id", async (req, res) => {
  const { movie_id } = req.params;

  try {
    // Fetch reviews for the movie
    const [reviews] = await pool.query(
      "SELECT r.id, r.rating, r.review, r.created_at, u.username FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.movie_id = ? ORDER BY r.created_at DESC",
      [movie_id]
    );

    if (reviews.length === 0) {
      return res
        .status(404)
        .json({ message: "No reviews found for this movie" });
    }

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Get All Reviews
router.get("/", async (req, res) => {
  try {
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

// Export the router
module.exports = router;
