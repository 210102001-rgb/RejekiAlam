'use strict';
/* Rejeki CMS — Express API + static frontend.
   GET  /api/settings, /api/products, /api/prices        (publik)
   POST /api/login, /api/logout, GET /api/me
   CRUD /api/admin/products, /api/admin/prices, /api/admin/settings, upload */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { openDb } = require('./db');

const PORT = process.env.PORT || 3005;
const db = openDb();
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------- auth ---------- */
const COOKIE = 'rejeki_admin';
function getSession(req) {
  const t = req.cookies[COOKIE];
  if (!t) return null;
  const s = db.prepare('SELECT s.*, u.username, u.nama FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(t);
  if (!s || s.expires_at < Date.now()) {
    if (s) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
    return null;
  }
  return s;
}
function requireAdmin(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  req.admin = s;
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash))
    return res.status(401).json({ error: 'Username atau password salah' });
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)')
    .run(token, u.id, Date.now() + 7 * 24 * 3600 * 1000);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000, path: '/' });
  res.json({ ok: true, nama: u.nama, username: u.username });
});
app.post('/api/logout', (req, res) => {
  const t = req.cookies[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const s = getSession(req);
  res.json(s ? { ok: true, nama: s.nama, username: s.username } : { ok: false });
});
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { old, baru } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.admin.user_id);
  if (!bcrypt.compareSync(String(old || ''), u.password_hash))
    return res.status(400).json({ error: 'Password lama salah' });
  if (String(baru || '').length < 6)
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(baru), 10), u.id);
  res.json({ ok: true });
});

/* ---------- publik ---------- */
function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const o = {};
  rows.forEach(r => { o[r.key] = r.value; });
  return o;
}
app.get('/api/settings', (req, res) => res.json(allSettings()));
app.get('/api/products', (req, res) => {
  const { cat, sub, q } = req.query;
  let sql = 'SELECT * FROM products WHERE active=1', args = [];
  if (cat) { sql += ' AND category=?'; args.push(cat); }
  if (sub) { sql += ' AND sub=?'; args.push(sub); }
  if (q) { sql += ' AND (name LIKE ? OR spec LIKE ?)'; args.push('%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY sort, id';
  res.json(db.prepare(sql).all(...args));
});
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
app.get('/api/prices', (req, res) => {
  res.json(db.prepare('SELECT * FROM prices ORDER BY sort, id').all());
});
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort, slug').all());
});
app.get('/api/subcategories', (req, res) => {
  const { cat } = req.query;
  if (cat) res.json(db.prepare('SELECT * FROM subcategories WHERE cat=? ORDER BY sort, slug').all(cat));
  else res.json(db.prepare('SELECT * FROM subcategories ORDER BY sort, slug').all());
});

/* ---------- admin: produk ---------- */
function validCategory(c) {
  if (!c) return 'lainnya';
  const r = db.prepare('SELECT slug FROM categories WHERE slug=?').get(c);
  return r ? c : 'lainnya';
}
function validSub(s, cat) {
  if (!s) return '';
  const r = db.prepare('SELECT slug FROM subcategories WHERE slug=? AND cat=?').get(s, cat);
  return r ? s : '';
}
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}
function uniqueSlug(table, base) {
  let slug = base, i = 2;
  while (db.prepare(`SELECT slug FROM ${table} WHERE slug=?`).get(slug)) slug = base + '-' + (i++);
  return slug;
}
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY sort, id').all());
});
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  const cat = validCategory(b.category);
  const r = db.prepare(`INSERT INTO products(name, category, sub, spec, price, unit, image, badge, sort, active, description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    String(b.name), cat, validSub(b.sub, cat),
    String(b.spec || ''), Math.max(0, parseInt(b.price) || 0), String(b.unit || '/pcs'),
    String(b.image || ''), String(b.badge || ''), parseInt(b.sort) || 0, b.active === false ? 0 : 1,
    String(b.description || ''));
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const cat = b.category !== undefined ? validCategory(b.category) : cur.category;
  const sub = b.sub !== undefined ? validSub(b.sub, cat) : (cat === cur.category ? cur.sub : '');
  db.prepare(`UPDATE products SET name=?, category=?, sub=?, spec=?, price=?, unit=?, image=?, badge=?, sort=?, active=?, description=? WHERE id=?`)
    .run(b.name ?? cur.name, cat, sub,
      b.spec ?? cur.spec, b.price !== undefined ? Math.max(0, parseInt(b.price) || 0) : cur.price,
      b.unit ?? cur.unit, b.image ?? cur.image, b.badge ?? cur.badge,
      b.sort !== undefined ? parseInt(b.sort) || 0 : cur.sort,
      b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
      b.description ?? cur.description, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- admin: harga ---------- */
app.get('/api/admin/prices', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM prices ORDER BY sort, id').all());
});
app.post('/api/admin/prices', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.product) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  const r = db.prepare('INSERT INTO prices(product, spec, unit, price, sort) VALUES (?,?,?,?,?)')
    .run(String(b.product), String(b.spec || ''), String(b.unit || ''), String(b.price || ''), parseInt(b.sort) || 0);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/admin/prices/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM prices WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE prices SET product=?, spec=?, unit=?, price=?, sort=? WHERE id=?')
    .run(b.product ?? cur.product, b.spec ?? cur.spec, b.unit ?? cur.unit, b.price ?? cur.price,
      b.sort !== undefined ? parseInt(b.sort) || 0 : cur.sort, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/prices/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM prices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- admin: kategori ---------- */
app.get('/api/admin/categories', requireAdmin, (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort, slug').all();
  const counts = {};
  db.prepare('SELECT category, COUNT(*) c FROM products GROUP BY category').all()
    .forEach(r => { counts[r.category] = r.c; });
  res.json(cats.map(c => ({ ...c, products: counts[c.slug] || 0 })));
});
app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const b = req.body || {};
  const label = String(b.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Label kategori wajib diisi' });
  const slug = uniqueSlug('categories', slugify(label));
  db.prepare('INSERT INTO categories(slug, label, sort) VALUES (?,?,?)')
    .run(slug, label, parseInt(b.sort) || 0);
  res.json({ ok: true, slug });
});
app.put('/api/admin/categories/:slug', requireAdmin, (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const label = String(b.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Label kategori wajib diisi' });
  db.prepare('UPDATE categories SET label=?, sort=? WHERE slug=?')
    .run(label, b.sort !== undefined ? parseInt(b.sort) || 0 : cur.sort, req.params.slug);
  res.json({ ok: true });
});
app.delete('/api/admin/categories/:slug', requireAdmin, (req, res) => {
  const slug = req.params.slug;
  if (slug === 'lainnya') return res.status(400).json({ error: 'Kategori "Lainnya" tidak boleh dihapus' });
  const n = db.prepare('SELECT COUNT(*) c FROM products WHERE category=?').get(slug).c;
  if (n > 0) return res.status(400).json({ error: 'Kategori dipakai ' + n + ' produk — pindahkan dulu produknya' });
  db.prepare('DELETE FROM categories WHERE slug=?').run(slug);
  res.json({ ok: true });
});

/* ---------- admin: sub-kategori ---------- */
app.get('/api/admin/subcategories', requireAdmin, (req, res) => {
  const { cat } = req.query;
  const rows = cat
    ? db.prepare('SELECT s.*, c.label AS cat_label FROM subcategories s JOIN categories c ON c.slug=s.cat WHERE s.cat=? ORDER BY s.sort, s.slug').all(cat)
    : db.prepare('SELECT s.*, c.label AS cat_label FROM subcategories s JOIN categories c ON c.slug=s.cat ORDER BY c.sort, s.sort, s.slug').all();
  const counts = {};
  db.prepare("SELECT sub, COUNT(*) c FROM products WHERE sub<'' GROUP BY sub").all()
    .forEach(r => { counts[r.sub] = r.c; });
  res.json(rows.map(r => ({ ...r, products: counts[r.slug] || 0 })));
});
app.post('/api/admin/subcategories', requireAdmin, (req, res) => {
  const b = req.body || {};
  const label = String(b.label || '').trim();
  const cat = validCategory(b.cat);
  if (!label) return res.status(400).json({ error: 'Label sub-kategori wajib diisi' });
  const slug = uniqueSlug('subcategories', slugify(label));
  db.prepare('INSERT INTO subcategories(slug, cat, label, sort) VALUES (?,?,?,?)')
    .run(slug, cat, label, parseInt(b.sort) || 0);
  res.json({ ok: true, slug });
});
app.put('/api/admin/subcategories/:slug', requireAdmin, (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM subcategories WHERE slug=?').get(req.params.slug);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const label = String(b.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Label sub-kategori wajib diisi' });
  const cat = b.cat !== undefined ? validCategory(b.cat) : cur.cat;
  db.prepare('UPDATE subcategories SET cat=?, label=?, sort=? WHERE slug=?')
    .run(cat, label, b.sort !== undefined ? parseInt(b.sort) || 0 : cur.sort, req.params.slug);
  if (cat !== cur.cat) db.prepare('UPDATE products SET sub="" WHERE sub=?').run(req.params.slug);
  res.json({ ok: true });
});
app.delete('/api/admin/subcategories/:slug', requireAdmin, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM products WHERE sub=?').get(req.params.slug).c;
  if (n > 0) return res.status(400).json({ error: 'Sub-kategori dipakai ' + n + ' produk — kosongkan dulu' });
  db.prepare('DELETE FROM subcategories WHERE slug=?').run(req.params.slug);
  res.json({ ok: true });
});

/* ---------- admin: pengaturan ---------- */
const SETTING_KEYS = ['site_name', 'tagline', 'wa_number', 'phone', 'address', 'hours',
  'hero_title', 'hero_sub', 'logo_url', 'footer_note'];
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const b = req.body || {};
  const up = db.prepare('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const k of SETTING_KEYS) if (b[k] !== undefined) up.run(k, String(b[k]));
  res.json({ ok: true });
});

/* ---------- admin: upload ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + (['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)) });
app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File gambar tidak valid (jpg/png/webp, maks 5MB)' });
  res.json({ ok: true, url: 'uploads/' + req.file.filename });
});

/* ---------- static ---------- */
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.use(express.static(PUBLIC, { maxAge: '1h' }));
app.get('/produk', (req, res) => res.sendFile(path.join(PUBLIC, 'produk.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));

app.listen(PORT, () => console.log('[rejeki-cms] listening on port ' + PORT));
