# Rejeki Alam — Sistem Katalog Material Bangunan

Katalog produk material bangunan dengan **8 tema marketplace** yang berbagi satu
backend dan satu database.

## Tema

| Path | Tema | Ciri pembeda |
|---|---|---|
| `/` | Hijau & Emas | Tema utama, hero + kartu produk |
| `/a/` | Editorial | Serif besar, daftar indeks, katalog dalam drawer |
| `/c/` | Industrial | Gelap, teknis, tabel data, rail kategori |
| `/shopee/` | Shopee-style | Search-first, flash sale, bottom tab bar |
| `/tokopedia/` | Tokopedia-style | Carousel banner, grid kategori, drawer |
| `/blibli/` | Blibli-style | Utility bar, sidebar, filter sheet |
| `/amazon/` | Amazon-style | Sidebar bertingkat, sering dibeli bersama, rating |
| `/lazada/` | Lazada-style | Flash sale vertikal, brand strip, voucher |
| `/bukalapak/` | Bukalapak-style | Kategori pilihan, snap-scroll, buka lapak |

Semua tema bergaya **marketplace generik** — bukan salinan aset atau merek
platform mana pun. Yang dipakai adalah pola antarmuka e-commerce yang umum
(bottom tab bar, flash sale, kartu produk, filter sheet), dengan identitas
visual sendiri.

## Menjalankan

```bash
npm install
ADMIN_PASSWORD_HASH=$(printf '%s' 'password-anda' | sha256sum | cut -d' ' -f1) \
ADMIN_USERNAME=admin PORT=3002 node server.mjs
```

Akses `http://localhost:3002`.

### Variabel lingkungan

| Variabel | Keterangan |
|---|---|
| `ADMIN_USERNAME` | Username admin (bawaan `admin`) |
| `ADMIN_PASSWORD_HASH` | SHA-256 hex dari password |
| `DB_PATH` | Lokasi file SQLite (bawaan `/data/katalog.db`) |
| `PORT` | Port aplikasi (bawaan `3002`) |

Password **tidak pernah** disimpan sebagai plaintext. Bandingkan dengan:

```bash
printf '%s' 'password-anda' | sha256sum
```

### Docker

```bash
docker build -t rejeki-alam .
docker run -d -p 3002:3002 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD_HASH=$(printf '%s' 'password-anda' | sha256sum | cut -d' ' -f1) \
  -v rejeki-data:/data rejeki-alam
```

## API

Semua tema membaca dari endpoint yang sama.

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/products` | Daftar produk (filter: `category`, `q`, `sort`) |
| GET | `/api/products/:slug` | Detail produk |
| GET | `/api/categories` | Daftar kategori |
| GET | `/api/content` | Tema, proyek, testimoni, klien |
| POST | `/api/admin/login` | Login admin |
| POST/PUT/DELETE | `/api/admin/projects[/:id]` | CRUD proyek |
| POST/PUT/DELETE | `/api/admin/testimonials[/:id]` | CRUD testimoni |
| POST/DELETE | `/api/admin/clients[/:id]` | CRUD klien |
| GET/POST | `/api/admin/theme` | Pilihan tema admin |

## Panel admin

Buka `/#admin` pada tema mana pun. Credential dikelola di server lewat
environment variable — tidak ada bypass di sisi klien.

## Data contoh

Portofolio proyek, testimoni, dan daftar klien masih **data demonstrasi**
menunggu data asli dari Rejeki Alam. Harga produk juga masih contoh.
Semuanya dapat diubah dari panel admin tanpa menyentuh kode.

Nomor WhatsApp pada setiap tema masih **placeholder** (`6281234567890`).

## Struktur

```
server.mjs        backend Express + SQLite
public/
  index.html      tema Hijau & Emas (utama)
  a/ c/           tema editorial & industrial
  shopee/ tokopedia/ blibli/ amazon/ lazada/ bukalapak/
Dockerfile
```
