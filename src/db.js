'use strict';
/* Rejeki CMS — lapisan database: node:sqlite (built-in Node ≥22.5). */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const seed = require('./seed-data');

const DB_PATH = process.env.REJEKI_DB_PATH || path.join(__dirname, '..', 'data', 'rejeki.sqlite');

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
     nama TEXT NOT NULL DEFAULT 'Administrator', created_at TEXT
   );
   CREATE TABLE IF NOT EXISTS products(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'lainnya',
     spec TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL DEFAULT 0,
     unit TEXT NOT NULL DEFAULT '/pcs', image TEXT NOT NULL DEFAULT '',
     badge TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1
   );
   CREATE TABLE IF NOT EXISTS prices(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     product TEXT NOT NULL, spec TEXT NOT NULL DEFAULT '',
     unit TEXT NOT NULL DEFAULT '', price TEXT NOT NULL DEFAULT '',
     sort INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS settings(
     key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE IF NOT EXISTS sessions(
     token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
   );`,
  `CREATE TABLE IF NOT EXISTS categories(
     slug TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
   );`,
  `CREATE TABLE IF NOT EXISTS subcategories(
     slug TEXT PRIMARY KEY, cat TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
     label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
   );
   ALTER TABLE products ADD COLUMN sub TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';`,
];

const DEFAULT_SETTINGS = {
  site_name: 'Rejeki Alam',
  tagline: 'MATERIAL BANGUNAN',
  wa_number: '6281234567890',
  phone: '(0271) 555-0123',
  address: 'Jl. Raya Solo – Semarang KM 8, Surakarta',
  hours: 'Senin – Sabtu, 08.00 – 17.00 WIB',
  hero_title: 'Semua kebutuhan <span class="hl">material proyek</span> Anda, <em>satu atap.</em>',
  hero_sub: 'Semen, besi, bata, cat, keramik hingga saniter — ready stock di gudang kami, harga distributor, dan siap kirim ke lokasi proyek maupun rumah Anda.',
  logo_url: '',
  footer_note: 'Distributor material bangunan terpercaya di Solo Raya sejak 2014.',
};

function openDb(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS _migrasi(v INTEGER PRIMARY KEY);');
  const row = db.prepare('SELECT MAX(v) AS v FROM _migrasi').get();
  const cur = (row && row.v) || 0;
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1;
    if (v > cur) { db.exec(sql); db.prepare('INSERT INTO _migrasi(v) VALUES (?)').run(v); }
  });
  seedDb(db);
  return db;
}

function seedDb(db) {
  const n = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (n > 0) return;
  const now = new Date().toISOString();
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users(username, password_hash, nama, created_at) VALUES (?,?,?,?)')
    .run('admin', bcrypt.hashSync(adminPass, 10), 'Administrator', now);
  const SEED_CATS = [['semen','Semen',0],['dinding','Bata & Dinding',1],['besi','Besi',2],['cat','Cat',3],['keramik','Keramik',4],['lainnya','Lainnya',5]];
  const ic = db.prepare('INSERT OR IGNORE INTO categories(slug, label, sort) VALUES (?,?,?)');
  for (const [slug, label, sort] of SEED_CATS) ic.run(slug, label, sort);
  const ip = db.prepare('INSERT INTO products(name, category, spec, price, unit, image, badge, sort, active) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const p of seed.products) ip.run(p.name, p.category, p.spec, p.price, p.unit, p.image, p.badge, p.sort, p.active);
  const ir = db.prepare('INSERT INTO prices(product, spec, unit, price, sort) VALUES (?,?,?,?,?)');
  for (const r of seed.prices) ir.run(r.product, r.spec, r.unit, r.price, r.sort);
  const is = db.prepare('INSERT INTO settings(key, value) VALUES (?,?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) is.run(k, v);
  console.log('[db] seeded: 1 admin,', seed.products.length, 'products,', seed.prices.length, 'prices');
}

module.exports = { openDb, DEFAULT_SETTINGS };
