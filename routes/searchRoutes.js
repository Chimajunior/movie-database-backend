

const express = require('express');

const pool = require('../db');
const router = express.Router();

// Search and Filter Movies 
router.get('/', async (req, res) => {
    try {
        const { title, genre, min_rating, query } = req.query;

        let sql = `
            SELECT m.*, 
                (SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) AS avg_rating
            FROM movies m 
        `;

        let conditions = [];
        let params = [];

        // Flexible general query
        if (query) {
            conditions.push(`(
                LOWER(m.title) LIKE ? OR
                LOWER(m.genre) LIKE ? OR
                LOWER(m.cast) LIKE ?
            )`);
            const q = `%${query.toLowerCase()}%`;
            params.push(q, q, q);
        }

        if (title) {
            conditions.push("LOWER(m.title) LIKE ?");
            params.push(`%${title.toLowerCase()}%`);
        }

        if (genre) {
            conditions.push("LOWER(m.genre) LIKE ?");
            params.push(`%${genre.toLowerCase()}%`);
        }

        if (min_rating) {
            conditions.push("(SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) >= ?");
            params.push(parseFloat(min_rating));
        }

        if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY avg_rating DESC";

        const [movies] = await pool.query(sql, params);

        if (movies.length === 0) {
            return res.status(404).json({ message: "No movies found" });
        }

        res.json(movies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
