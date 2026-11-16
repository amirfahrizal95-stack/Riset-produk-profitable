import express from 'express';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch {
  /* tanpa .env: pakai environment yang ada */
}

const { runResearch, describeError, connectorStatus } = await import('./src/research.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const MOCK_FIXTURE = process.env.MOCK_FIXTURE || ''; // hanya untuk pengembangan UI
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_CONCURRENT = 3;
const TYPES = new Set(['all', 'physical', 'digital']);

const cache = new Map();
let running = 0;

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(here, 'public')));

function authorized(req) {
  if (!ACCESS_CODE) return true;
  const given = Buffer.from(String(req.get('x-access-code') || ''));
  const expected = Buffer.from(ACCESS_CODE);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

app.get('/api/config', (_req, res) => {
  res.json({ ...connectorStatus(), requiresAccessCode: Boolean(ACCESS_CODE), mock: Boolean(MOCK_FIXTURE) });
});

app.post('/api/research', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Kode akses salah.' });

  const keyword = String(req.body?.keyword || '').replace(/\s+/g, ' ').trim();
  const type = TYPES.has(req.body?.type) ? req.body.type : 'all';
  const market = String(req.body?.market || 'Global').replace(/[^\p{L}\p{N} ,&()-]/gu, '').slice(0, 60) || 'Global';
  if (keyword.length < 2 || keyword.length > 120)
    return res.status(400).json({ error: 'Masukkan niche/keyword sepanjang 2–120 karakter.' });
  if (!MOCK_FIXTURE && !connectorStatus().claude)
    return res.status(503).json({ error: 'Server belum dikonfigurasi: isi ANTHROPIC_API_KEY di file .env lalu restart.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const finish = (event) => {
    emit(event);
    res.end();
  };

  const cacheKey = JSON.stringify([keyword.toLowerCase(), type, market.toLowerCase()]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL && !req.body?.fresh) {
    return finish({ type: 'result', data: hit.data, cached: true });
  }
  if (running >= MAX_CONCURRENT) return finish({ type: 'error', message: 'Server sedang sibuk. Coba lagi sebentar.' });

  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  running++;
  try {
    let data;
    if (MOCK_FIXTURE) {
      const fixture = JSON.parse(await readFile(MOCK_FIXTURE, 'utf8'));
      for (const ev of fixture.events) {
        emit(ev);
        await new Promise((r) => setTimeout(r, 250));
      }
      data = { ...fixture.result, meta: { ...fixture.result.meta, keyword, type, market } };
    } else {
      data = await runResearch({ keyword, type, market }, emit, abort.signal);
      cache.set(cacheKey, { at: Date.now(), data });
    }
    finish({ type: 'result', data });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('[research]', err);
      finish({ type: 'error', message: describeError(err) });
    }
  } finally {
    running--;
    clearInterval(heartbeat);
  }
});

app.listen(PORT, () => {
  const s = connectorStatus();
  console.log(`Riset Produk Profitable → http://localhost:${PORT}`);
  console.log(`Claude API: ${s.claude ? 'siap' : 'BELUM DIISI'} | Etsy API: ${s.etsy ? 'aktif' : 'nonaktif'} | Meta Ad Library API: ${s.meta ? 'aktif' : 'nonaktif'}`);
  if (MOCK_FIXTURE) console.log(`MODE MOCK: hasil dibaca dari ${MOCK_FIXTURE} (bukan data nyata)`);
});
