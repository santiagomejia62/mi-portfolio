// Vercel serverless function — proxy para Yahoo Finance Quote
// Evita bloqueos CORS y anti-bot del navegador
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  if (!symbols || symbols.trim().length < 1) {
    return res.json({ quoteResponse: { result: [], error: null } });
  }

  const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,currency';
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`;

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
      return res.status(r.status).json({ quoteResponse: { result: [], error: `HTTP ${r.status}` } });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ quoteResponse: { result: [], error: e.message } });
  }
}
