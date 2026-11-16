import { z } from 'zod';

export const SignalSchema = z.object({
  source: z.string().describe('Nama sumber, mis. "Etsy", "Facebook Ad Library", "Amazon Best Sellers", "TikTok Creative Center"'),
  signal: z.string().describe('Bukti konkret beserta angkanya, mis. "Badge Bestseller, 4.200 ulasan" atau "12 iklan aktif sejak 3 Okt"'),
  url: z.string().describe('URL sumber persis seperti yang ditemukan saat riset. String kosong jika tidak ada.'),
  observed: z.string().describe('Tanggal/periode bukti ini berlaku, mis. "Nov 2026". String kosong jika tidak diketahui.'),
});

export const ProductSchema = z.object({
  rank: z.number().int(),
  name: z.string().describe('Nama produk yang spesifik, bukan kategori umum'),
  type: z.enum(['physical', 'digital']),
  category: z.string(),
  description: z.string().describe('1-2 kalimat: produk apa dan untuk siapa'),
  why_profitable: z.string().describe('Mengapa bukti menunjukkan produk ini laku/menguntungkan dalam 30 hari terakhir'),
  price_range: z.string().describe('Kisaran harga jual yang teramati, dengan mata uang'),
  estimated_margin: z.string().describe('Perkiraan margin beserta asumsinya, atau "Tidak cukup data"'),
  target_audience: z.string(),
  competition: z.enum(['low', 'medium', 'high']),
  profit_score: z.number().int().describe('0-100, kekuatan bukti profitabilitas 30 hari terakhir'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Seberapa kuat & baru bukti yang ditemukan'),
  signals: z.array(SignalSchema).describe('Bukti pendukung; minimal satu'),
  how_to_start: z.string().describe('Cara sourcing (fisik) atau cara membuat (digital), plus channel jual yang disarankan'),
  risks: z.string(),
});

export const ReportSchema = z.object({
  summary: z.string().describe('Ringkasan 2-4 kalimat tentang kondisi niche ini 30 hari terakhir'),
  products: z.array(ProductSchema),
  trends: z.array(z.string()).describe('3-5 pola/tren lintas produk'),
  caveats: z.array(z.string()).describe('Keterbatasan data yang jujur: sumber yang tidak bisa diakses, bukti yang lemah, dsb.'),
});
