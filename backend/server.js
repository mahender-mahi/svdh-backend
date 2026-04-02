// server.js — Srivenkateshwara Dental Hospital Kamareddy API Server
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const { testConnection } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,   // stricter for auth endpoints
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});
const leadLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,
  message: { success: false, message: 'Too many form submissions. Please wait a moment.' },
});

app.use(globalLimiter);

// ─── Parsing ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Srivenkateshwara Dental Hospital API',
    location: 'Kamareddy, Telangana',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', authLimiter, require('./routes/auth'));
app.use('/api/leads', leadLimiter, require('./routes/leads'));

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🦷 Srivenkateshwara Dental Hospital API`);
    console.log(`📍 Kamareddy, Telangana`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health\n`);
  });
}

start();

module.exports = app;
