// routes/leads.js — Full CRUD for leads (public POST, admin GET/PUT/DELETE)
const express  = require('express');
const router   = express.Router();
const { body, query } = require('express-validator');
const { pool } = require('../config/db');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');

const SOURCES  = ['chatbot', 'form', 'manual', 'google', 'referral'];
const STATUSES = ['new', 'contacted', 'booked', 'completed', 'cancelled'];
const SERVICES = [
  'Dental Cleaning', 'Root Canal', 'Teeth Whitening', 'Dental Implants',
  'Cosmetic Dentistry', 'Orthodontics', 'Paediatric Dentistry', 'Oral Surgery',
];

// ─── POST /api/leads  (PUBLIC — website form & chatbot) ───────────────────────
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('phone').trim().notEmpty().withMessage('Phone is required').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number'),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('message').optional().trim().isLength({ max: 2000 }),
  body('service').optional().trim().isLength({ max: 100 }),
  body('source').optional().isIn(SOURCES),
  body('preferred_date').optional({ checkFalsy: true }).isDate(),
], validate, async (req, res) => {
  try {
    const { name, phone, email, message, service, source = 'form', preferred_date } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO leads (name, phone, email, message, service, source, preferred_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, message || null, service || null, source, preferred_date || null]
    );
    res.status(201).json({
      success: true,
      message: 'Appointment request received! Our team will contact you shortly.',
      id: result.insertId,
    });
  } catch (err) {
    console.error('Lead create error:', err);
    res.status(500).json({ success: false, message: 'Failed to save lead. Please try again.' });
  }
});

// ─── GET /api/leads  (ADMIN — paginated, filtered) ────────────────────────────
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('source').optional().isIn([...SOURCES, 'all']),
  query('status').optional().isIn([...STATUSES, 'all']),
  query('search').optional().trim().isLength({ max: 100 }),
  query('date_from').optional().isDate(),
  query('date_to').optional().isDate(),
], validate, async (req, res) => {
  try {
    const page     = req.query.page  || 1;
    const limit    = req.query.limit || 20;
    const offset   = (page - 1) * limit;
    const source   = req.query.source;
    const status   = req.query.status;
    const search   = req.query.search;
    const dateFrom = req.query.date_from;
    const dateTo   = req.query.date_to;

    let where = ['1=1'];
    let params = [];

    if (source && source !== 'all') { where.push('source = ?'); params.push(source); }
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (dateFrom) { where.push('DATE(created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)   { where.push('DATE(created_at) <= ?'); params.push(dateTo); }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereStr = where.join(' AND ');

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM leads WHERE ${whereStr}`, params
    );

    const [rows] = await pool.execute(
      `SELECT * FROM leads WHERE ${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total_today: await countToday(pool),
        by_source:   await countBySource(pool),
        by_status:   await countByStatus(pool),
      },
    });
  } catch (err) {
    console.error('Leads list error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/leads/:id ───────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── PUT /api/leads/:id ───────────────────────────────────────────────────────
router.put('/:id', auth, [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional().matches(/^[6-9]\d{9}$/),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('status').optional().isIn(STATUSES),
  body('source').optional().isIn(SOURCES),
  body('notes').optional().trim().isLength({ max: 5000 }),
], validate, async (req, res) => {
  try {
    const allowed = ['name','phone','email','message','service','source','status','notes','preferred_date'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id];
    const [result] = await pool.execute(`UPDATE leads SET ${fields} WHERE id = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Lead not found.' });
    res.json({ success: true, message: 'Lead updated successfully.' });
  } catch (err) {
    console.error('Lead update error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── DELETE /api/leads/:id ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM leads WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Lead not found.' });
    res.json({ success: true, message: 'Lead deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/leads/stats/summary ─────────────────────────────────────────────
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const [bySource] = await pool.execute(
      'SELECT source, COUNT(*) AS count FROM leads GROUP BY source'
    );
    const [byStatus] = await pool.execute(
      'SELECT status, COUNT(*) AS count FROM leads GROUP BY status'
    );
    const [todayCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM leads WHERE DATE(created_at) = CURDATE()'
    );
    const [weekCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM leads');
    res.json({
      success: true,
      stats: {
        total,
        today: todayCount[0].count,
        this_week: weekCount[0].count,
        by_source: bySource,
        by_status: byStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function countToday(pool) {
  const [[r]] = await pool.execute(
    'SELECT COUNT(*) AS c FROM leads WHERE DATE(created_at) = CURDATE()'
  );
  return r.c;
}
async function countBySource(pool) {
  const [r] = await pool.execute('SELECT source, COUNT(*) AS c FROM leads GROUP BY source');
  return r;
}
async function countByStatus(pool) {
  const [r] = await pool.execute('SELECT status, COUNT(*) AS c FROM leads GROUP BY status');
  return r;
}

module.exports = router;
