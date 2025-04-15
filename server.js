require('dotenv').config();
require('./db')
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const pool = require('./db');
const authRoutes = require('./routes/authRoutes.js');
const movieRoutes = require('./routes/movieRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const recommendRoutes = require('./routes/recommendRoutes'); 
const searchRoutes = require('./routes/searchRoutes');
const profileRoutes = require("./routes/profileRoutes.js");
const watchlistRoutes = require("./routes/watchlistRoutes");
const userRoutes = require('./routes/userRoutes');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/recommendations', recommendRoutes);
app.use('/api/search', searchRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/users", userRoutes); 

// Health check
app.get("/health", (req, res) => {
  res.send("Server is running");
});

// DB test
app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 + 1 AS result");
    res.json({ result: rows[0].result });
  } catch (error) {
    console.error("DB Test Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
