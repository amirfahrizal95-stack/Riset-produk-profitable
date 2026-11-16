# Riset Produk Profitable

Platform web untuk meriset **top 10 produk (fisik maupun digital) yang terbukti laku dalam 30 hari terakhir**.
Pengguna cukup mengetik niche/keyword; platform menelusuri berbagai sumber, lalu menampilkan peringkat lengkap dengan bukti dan tautannya.

## Cara kerja

1. **Konektor API (opsional)** — bila kuncinya diisi, data diambil langsung dari:
   - **Etsy Open API v3**: listing aktif untuk keyword, diurutkan menurut jumlah favorit.
   - **Meta (Facebook) Ad Library API**: iklan yang tayang 30 hari terakhir, dikelompokkan per pengiklan (jumlah iklan, lama tayang, jangkauan).
2. **Riset web langsung** — Claude memakai web search & web fetch untuk mencari bukti di Facebook Ad Library, Etsy, Amazon Best Sellers / Movers & Shakers, TikTok Shop & Creative Center, Gumroad, Shopee/Tokopedia, Google Trends, dan laporan tren bulan berjalan. Progres pencarian tampil langsung di layar.
3. **Penyusunan peringkat** — catatan riset diubah menjadi laporan terstruktur (skema tervalidasi): skor bukti, tingkat keyakinan, harga, perkiraan margin, persaingan, cara mulai, risiko, dan daftar bukti. Tautan bukti yang benar-benar muncul di hasil pencarian/API diberi tanda ✓.

Fitur lain: filter fisik/digital, pilihan pasar, riwayat riset (di browser), ekspor CSV/JSON, cache 6 jam, kode akses opsional.

## Menjalankan

Butuh Node.js 22+.

```bash
npm install
cp .env.example .env    # isi ANTHROPIC_API_KEY
npm start               # buka http://localhost:3000
```

| Variabel | Wajib | Keterangan |
|---|---|---|
| `ANTHROPIC_API_KEY` | ya | Kunci Claude API; web search harus aktif di organisasi Anda |
| `ETSY_API_KEY` | tidak | Mengaktifkan konektor Etsy |
| `META_ACCESS_TOKEN`, `META_AD_COUNTRIES` | tidak | Mengaktifkan konektor Meta Ad Library |
| `ACCESS_CODE` | tidak | Sangat disarankan bila di-deploy publik, agar kuota API tidak dipakai orang lain |
| `RESEARCH_MODEL`, `RESEARCH_EFFORT`, `MAX_WEB_SEARCHES`, `MAX_WEB_FETCHES` | tidak | Mengatur kedalaman (dan biaya) riset |

Satu riset biasanya memakan 2–5 menit dan memakai belasan pencarian web; biayanya mengikuti tarif Claude API.

Deploy: aplikasi ini server Node biasa (`npm start`, port dari `PORT`) — bisa dijalankan di Railway, Render, Fly.io, atau VPS. Platform serverless dengan batas waktu pendek tidak cocok karena riset berjalan beberapa menit.

## Batasan yang perlu diketahui

- **"Terbukti profitable" adalah kesimpulan dari sinyal publik**, bukan laporan laba. Tidak ada marketplace yang membuka laba penjual; yang dipakai adalah proxy: iklan yang terus dibayar, badge terlaris, jumlah ulasan/favorit, dan peringkat. Selalu buka tautan buktinya.
- **Meta Ad Library API** hanya menyediakan iklan komersial yang tayang di Uni Eropa/UK. Untuk negara lain, platform bergantung pada apa yang bisa ditemukan lewat pencarian web (halaman Ad Library sendiri sulit dibaca mesin).
- **Etsy** tidak membuka angka penjualan per listing lewat API; favorit dipakai sebagai proxy.
- Hasil bisa berbeda antar-riset karena bergantung pada hasil pencarian saat itu. Bila bukti yang layak kurang dari 10 produk, laporan sengaja menampilkan lebih sedikit daripada mengisi dengan tebakan.

## Pengembangan

```bash
npm test                                             # uji pipeline terhadap server Claude API tiruan
MOCK_FIXTURE=test/mock-fixture.json npm start        # menjalankan UI dengan data tiruan (tanpa kunci API)
```

Struktur: `server.js` (Express + SSE), `src/research.js` (pipeline riset), `src/connectors/` (Etsy, Meta), `src/schema.js` (skema laporan), `public/` (antarmuka).
