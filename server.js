'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const PIN_MINUTES = 10;
const MAX_PIN_ATTEMPTS = 5;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Attach a Render PostgreSQL database and set DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const emailTransport = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
}) : null;

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const makePin = () => crypto.randomInt(100000, 1000000).toString();

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorized_users (
      email TEXT PRIMARY KEY,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS login_codes (
      email TEXT PRIMARY KEY REFERENCES authorized_users(email) ON DELETE CASCADE,
      pin_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL REFERENCES authorized_users(email) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Community',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      location TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const configured = (process.env.AUTHORIZED_EMAILS || 'michael.arthur.mil@health.mil,test.user@health.mil,Michael.j.arthur2.mil@health.mil')
    .split(',').map(normalizeEmail).filter(Boolean);
  const admins = adminEmails();
  for (const email of configured) {
    await pool.query(
      `INSERT INTO authorized_users(email, is_admin) VALUES($1, $2)
       ON CONFLICT(email) DO UPDATE SET is_admin = authorized_users.is_admin OR EXCLUDED.is_admin`,
      [email, admins.includes(email)]
    );
  }
  for (const email of admins) {
    await pool.query('UPDATE authorized_users SET is_admin = TRUE WHERE email = $1', [email]);
  }
}

async function authenticate(req, res, next) {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) return res.status(401).json({ error: 'Sign-in required.' });
    const result = await pool.query(
      `SELECT s.email, u.is_admin FROM user_sessions s
       JOIN authorized_users u ON u.email = s.email
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hashToken(raw)]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired or access revoked. Please sign in again.' });
    req.user = result.rows[0];
    next();
  } catch (err) { next(err); }
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'mach-sfrg-api' }));

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const user = await pool.query('SELECT email FROM authorized_users WHERE email = $1', [email]);
    if (!user.rowCount) return res.status(403).json({ error: 'This email is not on the authorized access list.' });
    if (!emailTransport) return res.status(503).json({ error: 'Email delivery is not configured yet. Contact the application administrator.' });

    const pin = makePin();
    const pinHash = await bcrypt.hash(pin, 10);
    await pool.query(
      `INSERT INTO login_codes(email, pin_hash, attempts, expires_at)
       VALUES($1, $2, 0, NOW() + ($3 * INTERVAL '1 minute'))
       ON CONFLICT(email) DO UPDATE SET pin_hash=EXCLUDED.pin_hash, attempts=0, expires_at=EXCLUDED.expires_at`,
      [email, pinHash, PIN_MINUTES]
    );
    await emailTransport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'MACH SFRG sign-in verification code',
      text: `Your MACH SFRG sign-in code is ${pin}. It expires in ${PIN_MINUTES} minutes. If you did not request this code, ignore this email.`
    });
    res.json({ success: true, message: 'A verification code has been sent to your email.' });
  } catch (err) { next(err); }
});

app.post('/api/auth/verify', verifyLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const email = normalizeEmail(req.body.email);
    const pin = String(req.body.pin || '').trim();
    if (!email || !/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'Enter your email and six-digit code.' });
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM login_codes WHERE email=$1 FOR UPDATE', [email]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(401).json({ error: 'Invalid or expired code.' }); }
    const code = result.rows[0];
    if (new Date(code.expires_at) <= new Date() || code.attempts >= MAX_PIN_ATTEMPTS) {
      await client.query('DELETE FROM login_codes WHERE email=$1', [email]);
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Code expired or too many attempts. Request a new code.' });
    }
    const valid = await bcrypt.compare(pin, code.pin_hash);
    if (!valid) {
      const attempts = code.attempts + 1;
      await client.query('UPDATE login_codes SET attempts=$2 WHERE email=$1', [email, attempts]);
      await client.query('COMMIT');
      return res.status(401).json({ error: `Incorrect code. ${MAX_PIN_ATTEMPTS - attempts} attempts remaining.` });
    }
    const user = await client.query('SELECT email FROM authorized_users WHERE email=$1', [email]);
    if (!user.rowCount) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Access has been revoked.' }); }
    await client.query('DELETE FROM login_codes WHERE email=$1', [email]);
    const token = crypto.randomBytes(32).toString('hex');
    await client.query(
      `INSERT INTO user_sessions(token_hash,email,expires_at) VALUES($1,$2,NOW()+($3 * INTERVAL '1 hour'))`,
      [hashToken(token), email, SESSION_HOURS]
    );
    await client.query('COMMIT');
    res.json({ success: true, token, email });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
  finally { client.release(); }
});

app.post('/api/auth/logout', authenticate, async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    await pool.query('DELETE FROM user_sessions WHERE token_hash=$1', [hashToken(token)]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ email: req.user.email, isAdmin: req.user.is_admin }));

app.get('/api/events', authenticate, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM events ORDER BY starts_at ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

app.post('/api/events', authenticate, async (req, res, next) => {
  try {
    const { title, description='', category='Community', startsAt, endsAt=null, location='', imageUrl='', featured=false } = req.body;
    if (!String(title || '').trim() || !startsAt || Number.isNaN(Date.parse(startsAt))) return res.status(400).json({ error: 'Event title and valid start date/time are required.' });
    const { rows } = await pool.query(
      `INSERT INTO events(title,description,category,starts_at,ends_at,location,image_url,featured,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [String(title).trim(), description, category, startsAt, endsAt || null, location, imageUrl, Boolean(featured), req.user.email]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

app.put('/api/events/:id', authenticate, async (req, res, next) => {
  try {
    const { title, description='', category='Community', startsAt, endsAt=null, location='', imageUrl='', featured=false } = req.body;
    if (!String(title || '').trim() || !startsAt || Number.isNaN(Date.parse(startsAt))) return res.status(400).json({ error: 'Event title and valid start date/time are required.' });
    const { rows } = await pool.query(
      `UPDATE events SET title=$1,description=$2,category=$3,starts_at=$4,ends_at=$5,location=$6,image_url=$7,featured=$8,updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [String(title).trim(), description, category, startsAt, endsAt || null, location, imageUrl, Boolean(featured), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Event not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

app.delete('/api/events/:id', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Event not found.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.get('/api/admin/users', authenticate, requireAdmin, async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT email,is_admin,created_at FROM authorized_users ORDER BY email'); res.json(rows); }
  catch (err) { next(err); }
});

app.post('/api/admin/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const isAdmin = Boolean(req.body.isAdmin);
    await pool.query('INSERT INTO authorized_users(email,is_admin) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET is_admin=EXCLUDED.is_admin', [email,isAdmin]);
    res.status(201).json({ success: true, email, isAdmin });
  } catch (err) { next(err); }
});

app.delete('/api/admin/users/:email', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const email = normalizeEmail(decodeURIComponent(req.params.email));
    if (email === req.user.email) return res.status(400).json({ error: 'You cannot remove your own access.' });
    const result = await pool.query('DELETE FROM authorized_users WHERE email=$1', [email]);
    if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`MACH SFRG app listening on ${PORT}`));
}).catch(err => { console.error('Database initialization failed:', err); process.exit(1); });
