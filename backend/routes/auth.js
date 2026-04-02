// routes/auth.js — Login, logout, profile update
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body } = require('express-validator');
const { pool } = require('../config/db');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');

// ─── POST /api/login ───────────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute(
      'SELECT * FROM admins WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update last login
    await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    const token = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/logout ─────────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
  // JWT is stateless; client must delete the token.
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ─── GET /api/admin/profile ───────────────────────────────────────────────────
router.get('/admin/profile', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, last_login, created_at FROM admins WHERE id = ?',
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Admin not found.' });
    res.json({ success: true, admin: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PUT /api/admin/profile ───────────────────────────────────────────────────
router.put('/admin/profile', auth, [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
], validate, async (req, res) => {
  try {
    const { name, email } = req.body;
    // Check email uniqueness
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE email = ? AND id != ?', [email, req.admin.id]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }
    await pool.execute('UPDATE admins SET name = ?, email = ? WHERE id = ?', [name, email, req.admin.id]);
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PUT /api/admin/password ──────────────────────────────────────────────────
router.put('/admin/password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.execute(
      'SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]
    );
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, req.admin.id]);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
