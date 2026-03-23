// Vercel serverless function — proxy para Yahoo Finance Search
// Evita bloqueos CORS y anti-bot del navegador
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const { q } = req.query;
  if (!q || q.trim().length < 1) {
    return res.json({ quotes: [] });
  }

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false&lang=en-US&region=US`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
      },
    });

    if (!r.ok) {
      return res.status(r.status).json({ quotes: [] });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ quotes: [], error: e.message });
  }
}
