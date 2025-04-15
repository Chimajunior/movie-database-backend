const express = require('express');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Middleware to Authenticate Users
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(403).json({ message: "Access Denied" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

//  Content-Based Recommendations
router.get('/content-based', authenticateUser, async (req, res) => {
  const user_id = req.user.id;

  try {
    // Get genres from movies the user rated 4 or 5
    const [userReviews] = await pool.query(
      `SELECT DISTINCT m.genre 
       FROM reviews r 
       JOIN movies m ON r.movie_id = m.id 
       WHERE r.user_id = ? AND r.rating >= 4`,
      [user_id]
    );

    if (userReviews.length === 0) {
      return res.status(200).json([]); // not 404: handled gracefully
    }

    // Build genre conditions (flexible to comma-separated values)
    const genreConditions = userReviews.map(() => `genre LIKE ?`).join(" OR ");
    const genreValues = userReviews.map((row) => `%${row.genre}%`);

    // Recommend other movies with similar genres that the user hasn't rated
    const [recommendations] = await pool.query(
      `SELECT * 
       FROM movies 
       WHERE (${genreConditions}) 
       AND id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?) 
       ORDER BY RAND() 
       LIMIT 10`,
      [...genreValues, user_id]
    );

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Collaborative Filtering Route with Cold-Start Fallback
router.get('/collaborative', authenticateUser, async (req, res) => {
    const user_id = req.user.id;
  
    try {
      // Get all movies the user has rated
      const [ratedMovies] = await pool.query(
        `SELECT movie_id FROM reviews WHERE user_id = ?`,
        [user_id]
      );
      const ratedIds = new Set(ratedMovies.map(r => r.movie_id));
  
      // Get initial rating count
      const [[{ ratedCount }]] = await pool.query(
        `SELECT COUNT(*) AS ratedCount FROM reviews WHERE user_id = ?`,
        [user_id]
      );
  
      let recommendations = [];
  
      if (ratedCount >= 5) {
        // Find similar users
        const [similarUsers] = await pool.query(
          `SELECT DISTINCT r2.user_id 
           FROM reviews r1 
           JOIN reviews r2 ON r1.movie_id = r2.movie_id 
           WHERE r1.user_id = ? AND r1.rating >= 4 
           AND r2.rating >= 4 AND r2.user_id != ?`,
          [user_id, user_id]
        );
  
        const userIds = similarUsers.map(u => u.user_id);
  
        if (userIds.length) {
          // Get movies similar users liked that this user hasn't rated
          const [collaborative] = await pool.query(
            `SELECT DISTINCT m.* 
             FROM reviews r 
             JOIN movies m ON r.movie_id = m.id 
             WHERE r.user_id IN (?) AND r.rating >= 4 
             AND m.id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?) 
             ORDER BY RAND() 
             LIMIT 10`,
            [userIds, user_id]
          );
  
          recommendations = collaborative;
        }
  
        // De-duplicate fallback
        if (recommendations.length < 10) {
          const [fallback] = await pool.query(
            `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating
             FROM movies m LEFT JOIN reviews r ON m.id = r.movie_id
             GROUP BY m.id
             ORDER BY avg_rating DESC
             LIMIT 20`
          );
  
          const usedIds = new Set([...ratedIds, ...recommendations.map(m => m.id)]);
          const filteredFallback = fallback.filter(movie => !usedIds.has(movie.id)).slice(0, 10 - recommendations.length);
  
          recommendations = [...recommendations, ...filteredFallback];
        }
      } else {
        // Cold-start fallback (popular movies excluding rated)
        const [fallback] = await pool.query(
          `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating
           FROM movies m LEFT JOIN reviews r ON m.id = r.movie_id
           GROUP BY m.id
           ORDER BY avg_rating DESC
           LIMIT 20`
        );
  
        const filteredFallback = fallback.filter(movie => !ratedIds.has(movie.id)).slice(0, 10);
        recommendations = filteredFallback;
      }
  
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  
  
//  Hybrid Recommendation Route
router.get('/hybrid', authenticateUser, async (req, res) => {
    const user_id = req.user.id;
  
    try {
      // Content-based recommendations
      const [userGenres] = await pool.query(
        `SELECT DISTINCT m.genre 
         FROM reviews r 
         JOIN movies m ON r.movie_id = m.id 
         WHERE r.user_id = ? AND r.rating >= 4`,
        [user_id]
      );
  
      const genreConditions = userGenres.map(() => `genre LIKE ?`).join(" OR ");
      const genreValues = userGenres.map(row => `%${row.genre}%`);
  
      const [contentBased] = userGenres.length ? await pool.query(
        `SELECT * FROM movies 
         WHERE (${genreConditions}) 
         AND id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?)`,
        [...genreValues, user_id]
      ) : [[]];
  
      // Collaborative recommendations
      const [similarUsers] = await pool.query(
        `SELECT DISTINCT r2.user_id 
         FROM reviews r1 
         JOIN reviews r2 ON r1.movie_id = r2.movie_id 
         WHERE r1.user_id = ? AND r1.rating >= 4 
         AND r2.rating >= 4 AND r2.user_id != ?`,
        [user_id, user_id]
      );
  
      const userIds = similarUsers.map(u => u.user_id);
  
      const [collaborative] = userIds.length ? await pool.query(
        `SELECT DISTINCT m.* 
         FROM reviews r 
         JOIN movies m ON r.movie_id = m.id 
         WHERE r.user_id IN (?) AND r.rating >= 4 
         AND m.id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?)`,
        [userIds, user_id]
      ) : [[]];
  
      // Combine recommendations
      const movieMap = new Map();
  
      // Increase priority if movie appears in both sets
      contentBased.forEach(movie => {
        movieMap.set(movie.id, { ...movie, score: (movieMap.get(movie.id)?.score || 0) + 1 });
      });
  
      collaborative.forEach(movie => {
        movieMap.set(movie.id, { ...movie, score: (movieMap.get(movie.id)?.score || 0) + 1 });
      });
  
      // Sort movies by combined score (movies recommended by both methods first)
      const hybridRecommendations = Array.from(movieMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
  
      res.json(hybridRecommendations);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  


// // Hybrid Recommendation Route with Cold-Start Fallback
// router.get('/hybrid', authenticateUser, async (req, res) => {
//     const user_id = req.user.id;
  
//     try {
//       // Step 1: Check user's rating count
//       const [[{ ratedCount }]] = await pool.query(
//         `SELECT COUNT(*) AS ratedCount FROM reviews WHERE user_id = ?`,
//         [user_id]
//       );
  
//       let hybridRecommendations = [];
  
//       if (ratedCount >= 5) {
//         // Content-based recommendations
//         const [userGenres] = await pool.query(
//           `SELECT DISTINCT m.genre
//            FROM reviews r
//            JOIN movies m ON r.movie_id = m.id
//            WHERE r.user_id = ? AND r.rating >= 4`,
//           [user_id]
//         );
  
//         const genreConditions = userGenres.map(() => `genre LIKE ?`).join(" OR ");
//         const genreValues = userGenres.map(row => `%${row.genre}%`);
  
//         const [contentBased] = userGenres.length ? await pool.query(
//           `SELECT * FROM movies
//            WHERE (${genreConditions})
//            AND id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?)
//            LIMIT 10`,
//           [...genreValues, user_id]
//         ) : [[]];
  
//         // Collaborative recommendations
//         const [similarUsers] = await pool.query(
//           `SELECT DISTINCT r2.user_id
//            FROM reviews r1
//            JOIN reviews r2 ON r1.movie_id = r2.movie_id
//            WHERE r1.user_id = ? AND r1.rating >= 4
//            AND r2.rating >= 4 AND r2.user_id != ?`,
//           [user_id, user_id]
//         );
  
//         const userIds = similarUsers.map(u => u.user_id);
  
//         const [collaborative] = userIds.length ? await pool.query(
//           `SELECT DISTINCT m.*
//            FROM reviews r
//            JOIN movies m ON r.movie_id = m.id
//            WHERE r.user_id IN (?) AND r.rating >= 4
//            AND m.id NOT IN (SELECT movie_id FROM reviews WHERE user_id = ?)
//            LIMIT 10`,
//           [userIds, user_id]
//         ) : [[]];
  
//         // Combine recommendations
//         const movieMap = new Map();
  
//         contentBased.forEach(movie => {
//           movieMap.set(movie.id, { ...movie, score: (movieMap.get(movie.id)?.score || 0) + 1 });
//         });
  
//         collaborative.forEach(movie => {
//           movieMap.set(movie.id, { ...movie, score: (movieMap.get(movie.id)?.score || 0) + 1 });
//         });
  
//         hybridRecommendations = Array.from(movieMap.values())
//           .sort((a, b) => b.score - a.score)
//           .slice(0, 10);
  
//         // Fill with popular movies if recommendations are fewer than 10
//         if (hybridRecommendations.length < 10) {
//           const [popularMovies] = await pool.query(
//             `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating
//              FROM movies m LEFT JOIN reviews r ON m.id = r.movie_id
//              GROUP BY m.id ORDER BY avg_rating DESC LIMIT ?`,
//             [10 - hybridRecommendations.length]
//           );
  
//           hybridRecommendations = [...hybridRecommendations, ...popularMovies];
//         }
  
//       } else {
//         // Cold-start fallback: Popular movies
//         const [popularMovies] = await pool.query(
//           `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating
//            FROM movies m LEFT JOIN reviews r ON m.id = r.movie_id
//            GROUP BY m.id ORDER BY avg_rating DESC LIMIT 10`
//         );
  
//         hybridRecommendations = popularMovies;
//       }
  
//       res.json(hybridRecommendations);
  
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });
  
  

  module.exports = router;