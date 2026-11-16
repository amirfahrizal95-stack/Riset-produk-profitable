// Menguji pipeline riset terhadap server Claude API tiruan (tanpa jaringan, tanpa kunci asli).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const product = (rank, type, url) => ({
  rank, name: `Produk ${rank}`, type, category: 'Kategori', description: 'd', why_profitable: 'w',
  price_range: '$10', estimated_margin: '50%', target_audience: 't', competition: 'medium',
  profit_score: 150, confidence: 'high',
  signals: [{ source: 'Etsy', signal: 'Bestseller', url, observed: 'Nov 2026' }],
  how_to_start: 'h', risks: 'r',
});
const report = {
  summary: 's', trends: ['t'], caveats: ['c'],
  products: [product(2, 'digital', 'javascript:alert(1)'), product(1, 'physical', 'https://www.etsy.com/listing/1/?ref=x')],
};

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const usage = { input_tokens: 1, output_tokens: 1 };
const streamBody = (stop_reason) => sse([
  { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage } },
  { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'st1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"etsy best' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'seller cat"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 'st1', content: [{ type: 'web_search_result', url: 'https://www.etsy.com/listing/1', title: 'Listing', encrypted_content: 'x', page_age: null }] } },
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '', citations: null } },
  { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Catatan riset.' } },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: 'message_stop' },
]);

test('runResearch: progres, pause_turn, verifikasi URL, dan normalisasi hasil', async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body);
      requests.push({ url: req.url, beta: req.headers['anthropic-beta'], json });
      const isResearch = Boolean(json.tools);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (isResearch) {
        // Putaran pertama berhenti dengan pause_turn; kedua selesai.
        res.end(streamBody(requests.filter((r) => r.json.tools).length === 1 ? 'pause_turn' : 'end_turn'));
      } else {
        res.end(sse([
          { type: 'message_start', message: { id: 'm2', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify(report) } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
          { type: 'message_stop' },
        ]));
      }
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ETSY_API_KEY;
  delete process.env.META_ACCESS_TOKEN;

  try {
    const { runResearch } = await import('../src/research.js');
    const events = [];
    const out = await runResearch({ keyword: 'kucing', type: 'all', market: 'Global' }, (e) => events.push(e), undefined);

    const streams = requests.filter((r) => r.json.tools);
    assert.equal(streams.length, 2, 'pause_turn harus dilanjutkan');
    assert.equal(streams[1].json.messages.length, 2);
    assert.match(streams[0].beta, /server-side-fallback-2026-07-01/);
    assert.equal(streams[0].json.fallbacks, 'default');
    assert.deepEqual(streams[0].json.tools.map((t) => t.type), ['web_search_20260209', 'web_fetch_20260209']);
    assert.ok(requests.at(-1).json.output_config.format, 'fase 2 memakai structured output');

    assert.deepEqual(events.filter((e) => e.type === 'search').map((e) => e.query), ['etsy bestseller cat', 'etsy bestseller cat']);
    assert.deepEqual(out.products.map((p) => [p.rank, p.name]), [[1, 'Produk 1'], [2, 'Produk 2']]);
    assert.equal(out.products[0].profit_score, 100);
    assert.equal(out.products[0].signals[0].verified, true, 'URL dari hasil pencarian ditandai terverifikasi');
    assert.equal(out.products[1].signals[0].url, '', 'URL non-http dibuang');
    assert.equal(out.meta.sources_count, 1);
  } finally {
    server.close();
  }
});
