// Etsy Open API v3 — listing aktif untuk sebuah keyword.
// Etsy tidak membuka angka penjualan per listing; favorit & views dipakai sebagai proxy permintaan.

export async function fetchEtsy(keyword, { signal } = {}) {
  const key = process.env.ETSY_API_KEY;
  if (!key) return null;

  const url = new URL('https://openapi.etsy.com/v3/application/listings/active');
  url.search = new URLSearchParams({ keywords: keyword, limit: '100', sort_on: 'score', sort_order: 'desc' });
  const res = await fetch(url, { headers: { 'x-api-key': key }, signal });
  if (!res.ok) throw new Error(`Etsy API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { results = [] } = await res.json();

  const items = results
    .map((l) => ({
      title: l.title,
      url: l.url,
      type: l.listing_type === 'download' || l.is_digital ? 'digital' : 'physical',
      price: l.price ? `${(l.price.amount / l.price.divisor).toFixed(2)} ${l.price.currency_code}` : null,
      favorites: l.num_favorers ?? null,
      views: l.views ?? null,
      created: l.original_creation_timestamp
        ? new Date(l.original_creation_timestamp * 1000).toISOString().slice(0, 10)
        : null,
      tags: (l.tags || []).slice(0, 6),
    }))
    .sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0))
    .slice(0, 30);

  return { source: 'Etsy Open API', note: 'Listing aktif, diurutkan menurut jumlah favorit', items };
}
