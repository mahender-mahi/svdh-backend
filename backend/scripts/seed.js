// scripts/seed.js — Create the initial admin account
// Usage: node scripts/seed.js
require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('../config/db');

async function seed() {
  await testConnection();
  const email    = process.env.ADMIN_EMAIL    || 'admin@svdh.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@SVDH2025';
  const name     = process.env.ADMIN_NAME     || 'SVDH Admin';

  const hash = await bcrypt.hash(password, 12);

  const [exists] = await pool.execute('SELECT id FROM admins WHERE email = ?', [email]);
  if (exists.length) {
    console.log(`Admin already exists: ${email}`);
    await pool.end();
    return;
  }

  await pool.execute(
    'INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, 'superadmin']
  );

  console.log('✅ Admin seeded successfully!');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log('   ⚠️  Change this password immediately after first login!');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
