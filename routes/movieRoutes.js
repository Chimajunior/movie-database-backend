const express = require('express');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Middleware to check Admin
const authenticateAdmin = (req, res, next) => {
    const token = req.header("Authorization"); //  Getting the token
    if (!token) return res.status(403).json({ message: "Access Denied" });

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ message: "Admins only" });
        next();
    } catch (error) {
        res.status(400).json({ message: "Invalid token" });
    }
};


// Add Movie (Admin Only)
router.post('/', authenticateAdmin, async (req, res) => {
    const { title, genre, release_date, cast, poster_url } = req.body;
    try {
        await pool.query("INSERT INTO movies (title, genre, release_date, cast, poster_url) VALUES (?, ?, ?, ?, ?)", 
        [title, genre, release_date, cast, poster_url]);

        res.status(201).json({ message: "Movie added successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// //  Get All Movies (Supports Pagination)
// router.get('/', async (req, res) => {
//     try {
//         let { page, limit } = req.query;

//         if (!page || !limit) {
//             //  If no pagination params, return all movies (old behavior)
//             const [movies] = await pool.query("SELECT * FROM movies");
//             return res.json(movies);
//         }

//         // Apply Pagination
//         page = parseInt(page) || 1;
//         limit = parseInt(limit) || 10;
//         const offset = (page - 1) * limit;

//         const [movies] = await pool.query("SELECT * FROM movies LIMIT ? OFFSET ?", [limit, offset]);

//         const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM movies");

//         res.json({
//             page,
//             totalPages: Math.ceil(total / limit),
//             totalMovies: total,
//             movies
//         });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

//  Get Movies with Pagination & Sorting
router.get('/', async (req, res) => {
    try {
        let { page, limit, sortBy, order } = req.query;

        //  Default pagination settings
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        //  Allowed sorting fields
        const allowedSortFields = ['title', 'release_date', 'avg_rating'];
        sortBy = allowedSortFields.includes(sortBy) ? sortBy : 'title'; // Default to title

        // Order validation (ASC or DESC)
        order = order && order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        //  Query movies with pagination and sorting
        const [movies] = await pool.query(
            `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating 
            FROM movies m 
            LEFT JOIN reviews r ON m.id = r.movie_id 
            GROUP BY m.id
            ORDER BY ${sortBy} ${order} 
            LIMIT ? OFFSET ?`, 
            [limit, offset]
        );

        //  Get total count of movies
        const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM movies");

        res.json({
            page,
            totalPages: Math.ceil(total / limit),
            totalMovies: total,
            movies
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});





// Update Movie (Admin Only)
router.put('/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, genre, release_date, cast, poster_url } = req.body;
    
    try {
        // Check if movie exists
        const [movie] = await pool.query("SELECT * FROM movies WHERE id = ?", [id]);
        if (movie.length === 0) return res.status(404).json({ message: "Movie not found" });

        // Update the movie
        await pool.query(
            "UPDATE movies SET title=?, genre=?, release_date=?, cast=?, poster_url=? WHERE id=?", 
            [title, genre, release_date, cast, poster_url, id]
        );
        
        res.json({ message: "Movie updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Delete Movie (Admin Only)
router.delete('/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if movie exists
        const [movie] = await pool.query("SELECT * FROM movies WHERE id = ?", [id]);
        if (movie.length === 0) return res.status(404).json({ message: "Movie not found" });

        // Delete the movie
        await pool.query("DELETE FROM movies WHERE id=?", [id]);
        
        res.json({ message: "Movie deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



//  Search and Filter Movies 
router.get('/search', async (req, res) => {
    try {
        const { title, genre, min_rating } = req.query;

        // Base query with LEFT JOIN to include average rating
        let query = `
            SELECT m.*, 
                (SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) AS avg_rating
            FROM movies m 
        `;

        let conditions = [];
        let params = [];

        if (title) {
            conditions.push("m.title LIKE ?");
            params.push(`%${title}%`);
        }
        if (genre) {
            conditions.push("m.genre LIKE ?");
            params.push(`%${genre}%`);
        }
        if (min_rating) {
            conditions.push("(SELECT IFNULL(AVG(r.rating), 0) FROM reviews r WHERE r.movie_id = m.id) >= ?");
            params.push(parseFloat(min_rating));
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY avg_rating DESC"; //  Sorting by rating


        const [movies] = await pool.query(query, params);
        

        if (movies.length === 0) {
            return res.status(404).json({ message: "No movies found matching the criteria" });
        }

        res.json(movies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


//  Get a Specific Movie by ID (Public Access)
router.get('/:id', async (req, res) => {
    let { id } = req.params;
    id = parseInt(id, 10); // Ensure ID is an integer

    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid movie ID" });
    }

    try {
        const [movie] = await pool.query(
            `SELECT m.*, IFNULL(AVG(r.rating), 0) AS avg_rating 
            FROM movies m 
            LEFT JOIN reviews r ON m.id = r.movie_id 
            WHERE m.id = ? 
            GROUP BY m.id`, 
            [id]
        );

        if (movie.length === 0) {
            return res.status(404).json({ message: "Movie not found" });
        }

        res.json(movie[0]); // Return the movie details
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;
