# Rejeki CMS — Rejeki Alam Solo Baru

Katalog CMS untuk toko aluminium, kaca, ACP & aksesoris "Rejeki Alam Solo Baru" (Solo Baru, Sukoharjo).

- **Stack:** Node.js + Express + SQLite (`node:sqlite`)
- **Live:** https://filtrazon.solvianova.my.id/rejeki/
- **Struktur:** `src/` (server, db, seed), `public/` (index, produk, admin)

## Deploy (VPS)
HTML dibaked ke Docker image — setiap edit HTML wajib rebuild:
```bash
cd /var/www/rejeki-cms && sudo docker compose up -d --build
```
DB di volume `rejeki-data:/data`. Upload gambar via bind-mount `./public/uploads`.
