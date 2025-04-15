const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

// Register User
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if email is already used
    const [existingUsers] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

    if (existingUsers.length > 0) {
      return res.status(409).json({
        field: "email",
        error: "Email already exists. Try logging in or use a different email.",
      });
    }

    //  check if username already taken
    const [nameCheck] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (nameCheck.length > 0) {
      return res.status(409).json({
        field: "username",
        error: "Username already taken. Please choose another one.",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    await pool.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  try {
    // Check if user exists by email or username
    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({
        field: "identifier",
        error: "User not found. Please check your username or email.",
      });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        field: "password",
        error: "Incorrect password. Please try again.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error. Please try again later." });
  }
});



  
module.exports = router;
