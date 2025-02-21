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
        // Check if user already exists
        const [existingUsers] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "Email already exists. Please use a different one." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await pool.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", 
            [username, email, hashedPassword]);

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



//  Login User
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user by email
        const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
        if (users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

        const user = users[0];

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

        // Generate JWT Token
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
