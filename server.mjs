// KATALOG — full-stack catalog store.
// Node 20 + Express + SQLite. Self-contained: no external services, so it
// runs in a small container alongside the existing stacks without needing
// another MySQL instance (RAM on this host is already tight).
import express from 'express'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())

const db = new Database(process.env.DB_PATH || '/data/katalog.db')
db.pragma('journal_mode = WAL')

db.exec(`
-- ── Editable site content (projects, testimonials, clients) ───────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  location TEXT,
  year TEXT,
  material TEXT,
  scale TEXT,
  icon TEXT DEFAULT '🏢',
  body TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'Umum',
  price INTEGER NOT NULL DEFAULT 0,
  compare_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  icon TEXT DEFAULT '📦',
  unit TEXT DEFAULT 'sak',
  badge TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  address TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'MENUNGGU',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
`)

const seed = db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c > 0) return
  const ins = db.prepare(`INSERT INTO products
    (name,slug,description,category,price,compare_price,stock,icon,unit,badge)
    VALUES (@name,@slug,@description,@category,@price,@compare_price,@stock,@icon,@unit,@badge)`)
  const rows = [
    { name:'Semen Portland 40 kg', slug:'semen-portland-40kg',
      description:'Semen hidrolik umum untuk beton dan pasangan. Sesuai SNI 15-2049.',
      category:'Mortar', price:65000, compare_price:null, stock:240, icon:'🧱', unit:'sak', badge:'Terlaris' },
    { name:'Mortar Instan 25 kg', slug:'mortar-instan-25kg',
      description:'Plester dan acian siap pakai, tidak perlu dicampur manual.',
      category:'Mortar', price:38000, compare_price:45000, stock:186, icon:'🥄', unit:'sak', badge:null },
    { name:'Screed Ready Mix 25 kg', slug:'screed-ready-mix-25kg',
      description:'Screed lantai siap pakai, ketebalan 20-50 mm.',
      category:'Mortar', price:92000, compare_price:null, stock:74, icon:'🏗️', unit:'sak', badge:'Baru' },
    { name:'Perekat Keramik CMR 25 kg', slug:'perekat-keramik-cmr-25kg',
      description:'Perekat keramik dan granit untuk area dalam ruangan.',
      category:'Aksesoris', price:68000, compare_price:null, stock:132, icon:'🧱', unit:'sak', badge:null },
    { name:'Cat Dinding Interior 5 kg', slug:'cat-dinding-interior-5kg',
      description:'Cat lateks interior, tahantahan gores, coverage 10 m2/kg.',
      category:'Cat', price:145000, compare_price:null, stock:58, icon:'🎨', unit:'pcs', badge:null },
    { name:'Waterproofing Lantai 20 kg', slug:'waterproofing-lantai-20kg',
      description:'Pelapis waterproof polimer dua komponen untuk lantai dan teras.',
      category:'Waterproofing', price:485000, compare_price:560000, stock:9, icon:'🛡️', unit:'dus', badge:'Stok Menipis' },
    { name:'Gypsum Plank 90x2400', slug:'gypsum-plank-90x2400',
      description:'Papan gypsum untuk partisi dan plafon, tebal 9 mm.',
      category:'Aksesoris', price:125000, compare_price:null, stock:210, icon:'🪟', unit:'pcs', badge:null },
    { name:'Mesh Apectra Q51', slug:'mesh-apectra-q51',
      description:'Wire mesh Q51 untuk pengecoran lantai dan sloof.',
      category:'Aksesoris', price:295000, compare_price:null, stock:41, icon:'🔩', unit:'roll', badge:null },
    { name:'Silicon Sealant Netral', slug:'silicon-sealant-netral',
      description:'Silikon sealant netral untuksambungan suhu dan resistant.',
      category:'Aksesoris', price:68000, compare_price:null, stock:96, icon:'⚙️', unit:'pcs', badge:null },
    { name:'Oberit Beton 25 kg', slug:'oberit-beton-25kg',
      description:'Admixture beton ready mix untuk peningkatan workability dan kuat tekan.',
      category:'Mortar', price:385000, compare_price:null, stock:27, icon:'⛏️', unit:'sak', badge:null },
    { name:'Pasir Silika 25 kg', slug:'pasir-silika-25kg',
      description:'Pasir silika kering untuk mortar dan screed presisi.',
      category:'Mortar', price:55000, compare_price:null, stock:165, icon:'🏖️', unit:'sak', badge:null },
    { name:'Thinner Cat 1 L', slug:'thinner-cat-1l',
      description:'Pengencer cat jenis epoxy dan polyurethane.',
      category:'Cat', price:42000, compare_price:null, stock:88, icon:'🧪', unit:'pcs', badge:null },
  ]
  for (const r of rows) ins.run(r)

})
seed()

// Content seed (idempotent — separate from the product seed so it also runs on
// installs that already have products).
const seedContent = db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) c FROM projects').get().c > 0) return
  const pIns = db.prepare(`INSERT INTO projects
    (title,location,year,material,scale,icon,body,sort_order) VALUES
    (@title,@location,@year,@material,@scale,@icon,@body,@sort)`)
  for (const [i, r] of [
    { title:'Gedung Perkantoran 4 Lantai', location:'Jabodetabek', year:'2025',
      material:'Screed & Mortar', scale:'380 m²', icon:'🏢',
      body:'Supply screed lantai dan mortar acian untuk 4 lantai. Pouring selesai tanpa screed retak, dan waktu pengecoran berkurang 2 minggu.' },
    { title:'Perumahan Cluster 24 Unit', location:'Bandung', year:'2025',
      material:'Perekat Keramik', scale:'24 unit', icon:'🏠',
      body:'Perekat keramik dan waterproofing lantai untuk 24 rumah. Semua batch dari satu pabrik agar warna seragam antar unit.' },
    { title:'Renovasi Sekolah', location:'Semarang', year:'2024',
      material:'Cat & Plester', scale:'1.200 m²', icon:'🏫',
      body:'Pekerjaan dilakukan malam hari agar sekolah tidak libur. Cat interior dan plester selesai 6 minggu sesuai jadwal.' },
    { title:'Pabrik & Gudang', location:'Surabaya', year:'2024',
      material:'Waterproofing', scale:'2.800 m²', icon:'🏭',
      body:'Pelapis waterproof untuk lantai produksi dan atap gudang. Dirancang supaya mudah dirawat secara berkala.' },
    { title:'Klinik & Apotek', location:'Tangerang', year:'2024',
      material:'Perekat Keramik', scale:'210 m²', icon:'🏥',
      body:'Pengadaan keramik dan perekat untuk lantai klinik dan apotek. Material dikirim bertahap mengikuti progres pekerjaan.' },
    { title:'Rumah Tinggal 2 Lantai', location:'Owner', year:'2023',
      material:'Material Lengkap', scale:'1 unit', icon:'🏘️',
      body:'Kontraktor kecil dengan solusi all-in-one. Satu supplier untuk semen, cat, keramik, dan aksesori.' },
  ].entries()) pIns.run({ ...r, sort: i })

  const tIns = db.prepare(`INSERT INTO testimonials (quote,name,role,sort_order)
    VALUES (@quote,@name,@role,@sort)`)
  for (const [i, r] of [
    { quote:'Materialnya datang sesuai jadwal, jadi lantai tidak molor. Price juga masuk di budget proyek kami.',
      name:'Bagus Wibowo', role:'Kontraktor — Proyek Cluster Bandung' },
    { quote:'Yang paling membantu adalah technical spec di halaman mereka. Jadi tidak perlu menebak-nebak produk mana yang cocok.',
      name:'Rani Puspita', role:'Project Manager — Pembangunan Perkantoran' },
    { quote:'Order lewat WhatsApp cepat. Besoknya sudah dikonfirmasi stok dan ongkirnya.',
      name:'Joko Susilo', role:'Pemilik Rumah — Renovasi Dapur' },
    { quote:'Sudah tiga proyek kami supply. Batch selalu konsisten, tidak ada warna cat yang berbeda antar drum.',
      name:'Sari Dewi', role:'Kontraktor — Sekolah & Klinik' },
  ].entries()) tIns.run({ ...r, sort: i })

  const cIns = db.prepare('INSERT INTO clients (name,sort_order) VALUES (?,?)')
  for (const [i, n] of ['PT. Karya Bangun Perkasa','CV. Mandiri Konstruksi','PT. Bangun Selaras',
                        'CV. Sumber Material','PT. Mitra Proyek','Kontraktor Mandiri'].entries())
    cIns.run(n, i)
})
seedContent()

const api = express.Router()

api.get('/products', (req, res) => {
  const { category, q, sort } = req.query
  let sql = 'SELECT * FROM products WHERE active = 1'
  const args = []
  if (category && category !== 'Semua') { sql += ' AND category = ?'; args.push(category) }
  if (q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; args.push(`%${q}%`, `%${q}%`) }
  const order = sort === 'price_asc' ? 'price ASC'
    : sort === 'price_desc' ? 'price DESC'
    : sort === 'name' ? 'name ASC' : 'id DESC'
  sql += ` ORDER BY ${order}`
  res.json(db.prepare(sql).all(...args))
})

api.get('/products/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug)
  if (!row) return res.status(404).json({ error: 'Produk tidak ditemukan' })
  res.json(row)
})

api.get('/categories', (_req, res) => {
  res.json(db.prepare("SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category").all().map(r => r.category))
})

api.post('/orders', (req, res) => {
  const { customer, items } = req.body || {}
  if (!customer?.name || !customer?.email || !customer?.address) {
    return res.status(400).json({ error: 'Nama, email, dan alamat wajib diisi' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang kosong' })
  }

  const code = 'KLG-' + Date.now().toString(36).toUpperCase()

  const create = db.transaction(() => {
    let total = 0
    const lines = items.map(i => {
      const p = db.prepare('SELECT * FROM products WHERE id = ?').get(i.productId)
      if (!p) throw new Error('Produk tidak ada: ' + i.productId)
      const qty = Math.max(1, parseInt(i.qty) || 1)
      if (p.stock < qty) throw new Error(`Stok ${p.name} tidak cukup (sisa ${p.stock})`)
      total += p.price * qty
      return { product_id: p.id, name: p.name, price: p.price, qty }
    })

    const o = db.prepare(`INSERT INTO orders
      (code,customer_name,customer_email,customer_phone,address,total,status)
      VALUES (?,?,?,?,?,?, 'MENUNGGU')`)
      .run(code, customer.name, customer.email, customer.phone || null, customer.address, total)

    const addItem = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)')
    const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
    for (const l of lines) { addItem.run(o.lastInsertRowid, ...Object.values(l)); decStock.run(l.qty, l.product_id) }

    return { id: o.lastInsertRowid, code, total }
  })

  try {
    res.json({ ok: true, ...create() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

api.get('/orders', (_req, res) => {
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all())
})

api.get('/orders/:code', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code)
  if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan' })
  res.json({ ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) })
})

api.patch('/orders/:code', (req, res) => {
  const valid = ['MENUNGGU', 'DIPROSES', 'SELESAI', 'DIBATALKAN']
  const { status } = req.body || {}
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status tidak valid' })
  db.prepare('UPDATE orders SET status = ? WHERE code = ?').run(status, req.params.code)
  res.json({ ok: true })
})

// ── admin CRUD ───────────────────────────────────────────────────────────────

// ── Site content (public read / admin CRUD) ─────────────────────────────────
api.get('/content', (_req, res) => {
  const ord = 'ORDER BY sort_order, id'
  const th = db.prepare("SELECT value FROM settings WHERE key='theme'").get()
  res.json({
    theme: th?.value || 'hijau',
    projects:     db.prepare(`SELECT * FROM projects WHERE active=1 ${ord}`).all(),
    testimonials: db.prepare(`SELECT * FROM testimonials WHERE active=1 ${ord}`).all(),
    clients:      db.prepare(`SELECT * FROM clients WHERE active=1 ${ord}`).all(),
  })
})

api.post('/admin/projects', (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ error: 'Judul proyek wajib diisi' })
  const r = db.prepare(`INSERT INTO projects
    (title,location,year,material,scale,icon,body,sort_order)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.title, b.location||null, b.year||null, b.material||null, b.scale||null,
         b.icon||'🏢', b.body||null, parseInt(b.sort_order)||0)
  res.json({ ok: true, id: r.lastInsertRowid })
})

api.put('/admin/projects/:id', (req, res) => {
  const b = req.body || {}
  // partial update: only the keys present in the body are touched, so callers
  // can reorder (sort_order alone) without wiping every other field
  const cur = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'Proyek tidak ditemukan' })
  const has = k => Object.prototype.hasOwnProperty.call(b, k)
  const merged = {
    title:      has('title')      ? b.title      : cur.title,
    location:   has('location')   ? b.location   : cur.location,
    year:       has('year')       ? b.year       : cur.year,
    material:   has('material')   ? b.material   : cur.material,
    scale:      has('scale')      ? b.scale      : cur.scale,
    icon:       has('icon')       ? b.icon       : cur.icon,
    body:       has('body')       ? b.body       : cur.body,
    sort_order: has('sort_order') ? (parseInt(b.sort_order)||0) : cur.sort_order,
    active:     has('active')     ? (b.active?1:0) : cur.active,
  }
  db.prepare(`UPDATE projects SET title=@title,location=@location,year=@year,material=@material,
    scale=@scale,icon=@icon,body=@body,sort_order=@sort_order,active=@active WHERE id=@id`)
    .run({ ...merged, id: req.params.id })
  res.json({ ok: true })
})

api.delete('/admin/projects/:id', (req, res) => {
  db.prepare('UPDATE projects SET active=0 WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

api.post('/admin/testimonials', (req, res) => {
  const b = req.body || {}
  if (!b.quote || !b.name) return res.status(400).json({ error: 'Kutipan dan nama wajib diisi' })
  const r = db.prepare('INSERT INTO testimonials (quote,name,role,sort_order) VALUES (?,?,?,?)')
    .run(b.quote, b.name, b.role||null, parseInt(b.sort_order)||0)
  res.json({ ok: true, id: r.lastInsertRowid })
})

api.put('/admin/testimonials/:id', (req, res) => {
  const b = req.body || {}
  const cur = db.prepare('SELECT * FROM testimonials WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'Testimoni tidak ditemukan' })
  const has = k => Object.prototype.hasOwnProperty.call(b, k)
  db.prepare(`UPDATE testimonials SET quote=@quote,name=@name,role=@role,
    sort_order=@sort_order,active=@active WHERE id=@id`).run({
    quote:      has('quote')      ? b.quote      : cur.quote,
    name:       has('name')       ? b.name       : cur.name,
    role:       has('role')       ? b.role       : cur.role,
    sort_order: has('sort_order') ? (parseInt(b.sort_order)||0) : cur.sort_order,
    active:     has('active')     ? (b.active?1:0) : cur.active,
    id: req.params.id })
  res.json({ ok: true })
})

api.delete('/admin/testimonials/:id', (req, res) => {
  db.prepare('UPDATE testimonials SET active=0 WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

api.post('/admin/clients', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'Nama klien wajib diisi' })
  const r = db.prepare('INSERT INTO clients (name,sort_order) VALUES (?,?)')
    .run(b.name, parseInt(b.sort_order)||0)
  res.json({ ok: true, id: r.lastInsertRowid })
})

api.delete('/admin/clients/:id', (req, res) => {
  db.prepare('UPDATE clients SET active=0 WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── admin login ─────────────────────────────────────────────────────────────
// The password digest lives in the env, not the repo, so no secret is baked into
// the image and no native crypto dependency is needed at runtime.
api.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {}
  const userOk = username === (process.env.ADMIN_USERNAME || 'admin')
  const passOk = !!password && hash(password) === process.env.ADMIN_PASSWORD_HASH
  if (!userOk || !passOk) {
    // brief delay blunts brute force on a single-server panel
    return setTimeout(() => res.status(401).json({ ok: false, error: 'Username atau password salah' }), 350)
  }
  res.json({ ok: true, name: 'Administrator' })
})

function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex') }

api.post('/admin/products', (req, res) => {
  const b = req.body || {}
  if (!b.name || !b.price) return res.status(400).json({ error: 'Nama dan harga wajib diisi' })
  const slug = (b.slug || b.name).toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  try {
    const r = db.prepare(`INSERT INTO products
      (name,slug,description,category,price,compare_price,stock,icon,badge)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(b.name, slug, b.description || '', b.category || 'Umum',
           parseInt(b.price) || 0, b.compare_price ? parseInt(b.compare_price) : null,
           parseInt(b.stock) || 0, b.icon || '🧱', b.unit || 'sak', b.badge || null)
    res.json({ ok: true, id: r.lastInsertRowid, slug })
  } catch (e) { res.status(400).json({ error: 'Slug sudah dipakai' }) }
})

api.put('/admin/products/:id', (req, res) => {
  const b = req.body || {}
  const r = db.prepare(`UPDATE products SET name=?,description=?,category=?,price=?,
    compare_price=?,stock=?,icon=?,unit=?,badge=?,active=?,updated_at=datetime('now') WHERE id=?`)
    .run(b.name, b.description || '', b.category || 'Umum', parseInt(b.price) || 0,
         b.compare_price ? parseInt(b.compare_price) : null, parseInt(b.stock) || 0,
         b.icon || '🧱', b.unit || 'sak', b.badge || null, b.active ? 1 : 0, req.params.id)
  if (!r.changes) return res.status(404).json({ error: 'Produk tidak ditemukan' })
  res.json({ ok: true })
})

api.delete('/admin/products/:id', (req, res) => {
  db.prepare('UPDATE products SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

api.get('/admin/stats', (_req, res) => {
  const q = s => db.prepare(s).get()
  res.json({
    revenue: q('SELECT COALESCE(SUM(total),0) v FROM orders').v,
    orders: q('SELECT COUNT(*) v FROM orders').v,
    products: q('SELECT COUNT(*) v FROM products WHERE active=1').v,
    lowStock: q('SELECT COUNT(*) v FROM products WHERE active=1 AND stock < 10').v,
    byStatus: db.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all(),
    byCategory: db.prepare('SELECT category, COUNT(*) c FROM products WHERE active=1 GROUP BY category').all(),
  })
})


api.get('/admin/theme', (_req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='theme'").get()
  res.json({ theme: row?.value || 'hijau' })
})

api.post('/admin/theme', (req, res) => {
  const theme = (req.body?.theme || '').trim()
  const valid = ['hijau', 'putih', 'biru']
  if (!valid.includes(theme)) return res.status(400).json({ error: 'Tema tidak dikenal' })
  db.prepare("INSERT INTO settings (key,value) VALUES ('theme',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(theme)
  res.json({ ok: true, theme })
})

app.use('/api', api)
app.use(express.static(path.join(__dirname, 'public')))

const PORT = process.env.PORT || 3002
app.listen(PORT, '0.0.0.0', () => console.log(`Katalog listening on ${PORT}`))