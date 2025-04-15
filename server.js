require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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

app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/recommendations', recommendRoutes);
app.use('/api/search', searchRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/users", userRoutes); 

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});





