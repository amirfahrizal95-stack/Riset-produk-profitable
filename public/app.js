const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== ''));
  return node;
};

const TYPE = { all: 'Semua', physical: 'Fisik', digital: 'Digital' };
const LEVEL = { low: 'rendah', medium: 'sedang', high: 'tinggi' };
const HISTORY_KEY = 'rpp.history.v1';
const CODE_KEY = 'rpp.accessCode';

let current = null; // laporan yang sedang tampil
let controller = null;
let timer = null;
let lastQuery = null;

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* penyimpanan penuh/diblokir: lewati */
    }
  },
};

// ---------- status sumber ----------
async function loadConfig() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    const chip = (label, on, required) =>
      el('span', {
        className: `dot-chip ${on ? 'on' : 'off'} ${required ? 'required' : ''}`,
        title: on ? 'Aktif' : required ? 'Wajib: isi ANTHROPIC_API_KEY di .env' : 'Opsional: aktifkan lewat .env',
      }, label);
    $('sourcesStatus').replaceChildren(
      chip(cfg.mock ? 'Mode contoh (bukan data nyata)' : 'Riset web', cfg.mock || cfg.claude, !cfg.mock),
      chip('API Etsy', cfg.etsy),
      chip('API Meta Ad Library', cfg.meta),
    );
  } catch {
    /* status hanya informatif */
  }
}

// ---------- riwayat ----------
function renderHistory() {
  const items = store.get(HISTORY_KEY, []);
  $('history').hidden = items.length === 0;
  $('historyList').replaceChildren(
    ...items.map((r) =>
      el('button', {
        type: 'button',
        title: new Date(r.meta.generated_at).toLocaleString('id-ID'),
        onclick: () => showReport(r),
      }, `${r.meta.keyword} · ${TYPE[r.meta.type]}`),
    ),
  );
}

function saveHistory(report) {
  const same = (r) => r.meta.keyword === report.meta.keyword && r.meta.type === report.meta.type && r.meta.market === report.meta.market;
  const items = [report, ...store.get(HISTORY_KEY, []).filter((r) => !same(r))].slice(0, 6);
  store.set(HISTORY_KEY, items);
  renderHistory();
}

// ---------- progres ----------
function log(kind, text) {
  const list = $('log');
  list.append(el('li', {}, el('b', {}, kind), el('span', {}, text)));
  list.scrollTop = list.scrollHeight;
}

function setBusy(busy, keyword) {
  $('submit').disabled = busy;
  $('progress').hidden = !busy;
  clearInterval(timer);
  if (!busy) return;
  $('progressTitle').textContent = `Meriset “${keyword}”…`;
  $('log').replaceChildren();
  const start = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - start) / 1000);
    $('elapsed').textContent = `Berjalan ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`;
  };
  tick();
  timer = setInterval(tick, 1000);
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = false;
}

function askAccessCode() {
  return new Promise((resolve) => {
    const dialog = $('accessDialog');
    $('accessInput').value = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? $('accessInput').value : null), { once: true });
    dialog.showModal();
  });
}

// ---------- riset ----------
async function research(query, { fresh = false } = {}) {
  lastQuery = query;
  $('error').hidden = true;
  $('results').hidden = true;
  setBusy(true, query.keyword);
  controller = new AbortController();

  try {
    let res;
    for (;;) {
      res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Code': sessionStorage.getItem(CODE_KEY) || '' },
        body: JSON.stringify({ ...query, fresh }),
        signal: controller.signal,
      });
      if (res.status !== 401) break;
      const code = await askAccessCode();
      if (code == null) throw new Error('Kode akses diperlukan untuk menjalankan riset.');
      sessionStorage.setItem(CODE_KEY, code);
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server error ${res.status}`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += chunk.value;
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'status') log('info', ev.message);
        else if (ev.type === 'search') log('cari', ev.query);
        else if (ev.type === 'fetch') log('buka', ev.url);
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'result') {
          saveHistory(ev.data);
          showReport(ev.data, ev.cached);
          done = true;
        }
      }
    }
    if (!done) throw new Error('Koneksi terputus sebelum riset selesai. Coba lagi.');
  } catch (err) {
    if (err.name !== 'AbortError') showError(err.message);
  } finally {
    setBusy(false);
    controller = null;
  }
}

// ---------- hasil ----------
function signalItem(s) {
  return el('li', {},
    el('span', { className: 'src' }, `${s.source}: `),
    s.signal,
    s.observed ? el('span', { className: 'when' }, ` (${s.observed})`) : null,
    s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, 'lihat bukti ↗') : null,
    s.verified ? el('span', { className: 'ok', title: 'URL ini muncul di hasil pencarian/API saat riset' }, '✓ sumber ditemukan saat riset') : null,
  );
}

function productCard(p) {
  const fact = (label, value) => el('div', {}, el('dt', {}, label), el('dd', {}, value));
  const meterFill = el('i');
  meterFill.style.width = `${p.profit_score}%`;

  return el('article', { className: 'card' },
    el('div', { className: 'rank', ariaHidden: 'true' }, String(p.rank).padStart(2, '0')),
    el('div', { className: 'card-head' },
      el('div', {},
        el('h3', {}, p.name),
        el('div', { className: 'badges' },
          el('span', { className: `badge ${p.type}` }, TYPE[p.type]),
          el('span', { className: 'badge' }, p.category),
          el('span', { className: `badge conf-${p.confidence}` }, `Keyakinan ${LEVEL[p.confidence]}`),
        ),
      ),
      el('div', { className: 'score' },
        el('small', {}, 'Skor bukti'),
        el('strong', {}, String(p.profit_score)),
        el('div', { className: 'meter', role: 'img', ariaLabel: `Skor bukti ${p.profit_score} dari 100` }, meterFill),
      ),
    ),
    el('div', { className: 'card-body' },
      el('p', { className: 'why' }, p.why_profitable),
      el('p', { className: 'desc' }, p.description),
      el('dl', { className: 'facts' },
        fact('Harga jual', p.price_range),
        fact('Perkiraan margin', p.estimated_margin),
        fact('Persaingan', LEVEL[p.competition]),
        fact('Target pembeli', p.target_audience),
      ),
      el('ul', { className: 'signals' }, ...p.signals.map(signalItem)),
      el('details', {},
        el('summary', {}, 'Cara mulai & risiko'),
        el('p', {}, el('b', {}, 'Cara mulai'), p.how_to_start),
        el('p', {}, el('b', {}, 'Risiko'), p.risks),
      ),
    ),
  );
}

function renderCards(filter) {
  const list = current.products.filter((p) => filter === 'all' || p.type === filter);
  $('cards').replaceChildren(
    ...(list.length
      ? list.map(productCard)
      : [el('div', { className: 'empty' }, 'Tidak ada produk dengan bukti yang cukup untuk kategori ini.')]),
  );
  for (const b of $('filter').children) b.setAttribute('aria-selected', String(b.dataset.filter === filter));
}

function showReport(report, cached = false) {
  current = report;
  const { meta, products } = report;
  const fmt = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  $('resultMeta').textContent = [
    `${fmt(meta.period.since)} – ${fmt(meta.period.until)}`,
    `Pasar ${meta.market}`,
    `${meta.sources_count} sumber web`,
    ...(meta.connectors || []),
    cached ? 'dari cache' : null,
  ].filter(Boolean).join(' · ');
  $('resultTitle').textContent = `Top ${products.length} produk untuk “${meta.keyword}”`;
  $('summary').textContent = report.summary;

  const counts = { all: products.length, physical: 0, digital: 0 };
  for (const p of products) counts[p.type]++;
  $('filter').replaceChildren(
    ...Object.keys(TYPE).map((k) =>
      el('button', { type: 'button', role: 'tab', onclick: () => renderCards(k) }, `${TYPE[k]} (${counts[k]})`),
    ),
  );
  [...$('filter').children].forEach((b, i) => (b.dataset.filter = Object.keys(TYPE)[i]));
  $('filter').hidden = counts.physical === 0 || counts.digital === 0;
  renderCards('all');

  const fill = (listId, panelId, items) => {
    $(listId).replaceChildren(...items.map((t) => el('li', {}, t)));
    $(panelId).hidden = items.length === 0;
  };
  fill('trends', 'trendsPanel', report.trends || []);
  fill('caveats', 'caveatsPanel', report.caveats || []);

  $('error').hidden = true;
  $('results').hidden = false;
  $('keyword').value = meta.keyword;
  lastQuery = { keyword: meta.keyword, type: meta.type, market: meta.market };
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- ekspor ----------
function download(name, mime, content) {
  const a = el('a', { href: URL.createObjectURL(new Blob([content], { type: mime })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

const slug = () => current.meta.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'riset';

function toCsv() {
  // Awalan apostrof mencegah sel dieksekusi sebagai rumus di Excel/Sheets.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Rank', 'Produk', 'Jenis', 'Kategori', 'Skor bukti', 'Keyakinan', 'Harga', 'Margin', 'Persaingan', 'Target', 'Alasan', 'Bukti', 'URL bukti', 'Cara mulai', 'Risiko'];
  const rows = current.products.map((p) => [
    p.rank, p.name, TYPE[p.type], p.category, p.profit_score, LEVEL[p.confidence], p.price_range, p.estimated_margin,
    LEVEL[p.competition], p.target_audience, p.why_profitable,
    p.signals.map((s) => `${s.source}: ${s.signal}`).join(' | '),
    p.signals.map((s) => s.url).filter(Boolean).join(' | '),
    p.how_to_start, p.risks,
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

// ---------- event ----------
const formQuery = () => {
  const data = new FormData($('form'));
  return { keyword: data.get('keyword').trim(), type: data.get('type'), market: data.get('market') };
};

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = formQuery();
  if (q.keyword.length >= 2) research(q);
});
$('examples').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  $('keyword').value = e.target.textContent;
  $('form').requestSubmit();
});
$('cancel').addEventListener('click', () => controller?.abort());
$('refresh').addEventListener('click', () => lastQuery && research(lastQuery, { fresh: true }));
$('exportCsv').addEventListener('click', () => download(`riset-${slug()}.csv`, 'text/csv;charset=utf-8', toCsv()));
$('exportJson').addEventListener('click', () => download(`riset-${slug()}.json`, 'application/json', JSON.stringify(current, null, 2)));

loadConfig();
renderHistory();
