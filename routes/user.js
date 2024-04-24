const express = require('express');
const { pool } = require("../config");
const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { generateToken } = require("../utils/token");
const { isLoggedIn } = require("../middleware");


router.post("/signin", async (req, res, next) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
      // Check if username is correct
      const [users] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
      const user = users[0];

      if (!user) {
        throw new Error("Incorrect username or password");
      }

      // Check if password is correct
      if (!(await bcrypt.compare(password, user.password))) {
        throw new Error("Incorrect username or password");
      }

      // Check if token already existed
      const [tokens] = await pool.query("SELECT * FROM access_tokens WHERE user_id=?", [user.user_id]);
      let token = tokens[0]?.token;

      if (!token) {
        // Generate and save token into database
        token = generateToken();
        await pool.query("INSERT INTO access_tokens(user_id, token) VALUES (?, ?)", [user.user_id, token]);
        if (user.role === 'applicant') {
          await pool.query('INSERT INTO students (user_id, email) VALUES (?, ?)',[user.user_id, email]);
        } else if (user.role === 'recruiter') {
          await pool.query('INSERT INTO companies (user_id, email) VALUES (?, ?)', [user.user_id, email]);
        } else if (user.role === 'admin') {
          await pool.query('INSERT INTO admin (user_id, email) VALUES (?, ?)', [user.user_id, email]);
        }
      }
      res.status(200).json({ token: token });
  } catch (error) {
    res.status(400).json(error.toString());
  }
});



router.get("/me", isLoggedIn, async (req, res, next) => {
    // req.user ถูก save ข้อมูล user จาก database ใน middleware function "isLoggedIn"
    
    res.json(req.user);
  });

// change email
router.post('/changeEmail', isLoggedIn, async (req, res) => {
  try {
    const { email, password } = req.body;
    const userId = req.user.user_id;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (!user || !(await bcrypt.compare(password, user[0].password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if the new email is already in use by another user
    const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ? AND user_id != ?', [email, userId]);
    if (existingUser.length > 0) {
      return res.status(402).json({ message: 'Email is already in use by another user' });
    }

    // Update the email in users table
    await pool.query('UPDATE users SET email = ? WHERE user_id = ?', [email, userId]);
    

    // If the user is a recruiter, also update the email in companies table
    if (req.user.role === 'recruiter') {
      await pool.query('UPDATE companies SET email = ? WHERE user_id = ?', [email, userId]);
    }

// If the user is a recruiter, also update the email in companies table
    if (req.user.role === 'applicant') {
      await pool.query('UPDATE students SET email = ? WHERE user_id = ?', [email, userId]);
    }

    res.status(200).json({ message: 'Email changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.post('/changePassword', isLoggedIn, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.user_id;

    // Validate the current password and new password
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Authenticate the user
    const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (!user || !(await bcrypt.compare(currentPassword, user[0].password))) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    await pool.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, userId]);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




module.exports = router;
