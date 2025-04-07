require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const movieRoutes = require('./routes/movieRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const recommendRoutes = require('./routes/recommendRoutes'); 
const searchRoutes = require('./routes/searchRoutes');
const profileRoutes = require("./routes/profileRoutes.js");
const watchlistRoutes = require("./routes/watchlistRoutes");




const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/search', searchRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/watchlist", watchlistRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));





