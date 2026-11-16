// Meta Ad Library API — iklan yang tayang dalam 30 hari terakhir untuk sebuah keyword.
// Batasan Meta: iklan komersial hanya tersedia untuk yang tayang di Uni Eropa/UK.
// Iklan yang terus dibayar berminggu-minggu adalah proxy kuat bahwa produknya menghasilkan.

const DAY = 86_400_000;

export async function fetchMetaAds(keyword, { since, signal } = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;

  const countries = (process.env.META_AD_COUNTRIES || 'GB,DE,FR').split(',').map((c) => c.trim().toUpperCase());
  const url = new URL('https://graph.facebook.com/v23.0/ads_archive');
  url.search = new URLSearchParams({
    search_terms: keyword,
    ad_type: 'ALL',
    ad_active_status: 'ALL',
    ad_reached_countries: JSON.stringify(countries),
    ad_delivery_date_min: since,
    fields:
      'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,eu_total_reach',
    limit: '200',
    access_token: token,
  });
  const res = await fetch(url, { signal });
  if (!res.ok) {
    // Jangan pernah meneruskan URL (berisi token) ke pesan error.
    const body = await res.json().catch(() => ({}));
    throw new Error(`Meta Ad Library API ${res.status}: ${body?.error?.message || 'permintaan gagal'}`);
  }
  const { data = [] } = await res.json();

  const now = Date.now();
  const byPage = new Map();
  for (const ad of data) {
    const start = Date.parse(ad.ad_delivery_start_time);
    const stop = ad.ad_delivery_stop_time ? Date.parse(ad.ad_delivery_stop_time) : now;
    const days = Number.isFinite(start) ? Math.max(1, Math.round((stop - start) / DAY)) : null;
    const entry = byPage.get(ad.page_name) || { advertiser: ad.page_name, ads: 0, longest_run_days: 0, total_eu_reach: 0, examples: [] };
    entry.ads += 1;
    entry.longest_run_days = Math.max(entry.longest_run_days, days ?? 0);
    entry.total_eu_reach += Number(ad.eu_total_reach) || 0;
    if (entry.examples.length < 2) {
      entry.examples.push({
        // URL publik; ad_snapshot_url dari API memuat access token sehingga sengaja tidak dipakai.
        url: `https://www.facebook.com/ads/library/?id=${ad.id}`,
        headline: ad.ad_creative_link_titles?.[0] || null,
        text: (ad.ad_creative_bodies?.[0] || '').slice(0, 220),
        started: ad.ad_delivery_start_time || null,
        still_active: !ad.ad_delivery_stop_time,
      });
    }
    byPage.set(ad.page_name, entry);
  }

  const items = [...byPage.values()]
    .sort((a, b) => b.ads * b.longest_run_days - a.ads * a.longest_run_days)
    .slice(0, 25);

  return {
    source: 'Meta Ad Library API',
    note: `Iklan yang tayang sejak ${since} di ${countries.join(', ')}, dikelompokkan per pengiklan`,
    items,
  };
}
