

const express = require('express');

const pool = require('../db');
const router = express.Router();

// Search and Filter Movies 
router.get("/", async (req, res) => {
    try {
      const { title, genre, min_rating, query } = req.query;
  
      let sql = `
        SELECT m.*, 
               (SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) AS avg_rating
        FROM movies m
      `;
  
      const conditions = [];
      const params = [];
  
      if (query) {
        const contains = `%${query.toLowerCase()}%`;
        const startsWith = `${query.toLowerCase()}%`;
  
        conditions.push(`(
          LOWER(m.title) LIKE ? OR
          LOWER(m.genre) LIKE ? OR
          LOWER(m.cast) LIKE ?
        )`);
  
        params.push(contains, contains, contains);
  
        sql += conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  
        sql += `
          ORDER BY 
            CASE 
              WHEN LOWER(m.title) LIKE ? THEN 0 
              ELSE 1 
            END,
            m.title ASC
          LIMIT 10
        `;
  
        params.push(startsWith);
      } else {
        if (title) {
          conditions.push("LOWER(m.title) LIKE ?");
          params.push(`%${title.toLowerCase()}%`);
        }
  
        if (genre) {
          conditions.push("LOWER(m.genre) LIKE ?");
          params.push(`%${genre.toLowerCase()}%`);
        }
  
        if (min_rating) {
          conditions.push(`(SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) >= ?`);
          params.push(parseFloat(min_rating));
        }
  
        sql += conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
        sql += " ORDER BY avg_rating DESC LIMIT 100";
      }
  
      const [movies] = await pool.query(sql, params);
  
      if (movies.length === 0) {
        return res.status(404).json({ message: "No movies found" });
      }
  
      res.json(movies);
    } catch (error) {
      console.error("Search error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/suggestions", async (req, res) => {
    const { q } = req.query;
  
    if (!q || q.trim() === "") {
      return res.json([]);
    }
  
    try {
      const startsWith = `${q.toLowerCase()}%`;
      const contains = `%${q.toLowerCase()}%`;
  
      const [results] = await pool.query(
        `SELECT id, title, genre, poster_url 
         FROM movies 
         WHERE LOWER(title) LIKE ? OR LOWER(title) LIKE ? 
         ORDER BY 
           CASE WHEN LOWER(title) LIKE ? THEN 0 ELSE 1 END,
           title ASC
         LIMIT 10`,
        [startsWith, contains, startsWith]
      );
  
      res.json(results);
    } catch (error) {
      console.error("Suggestion fetch failed:", error.message);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });
  
  

module.exports = router;
