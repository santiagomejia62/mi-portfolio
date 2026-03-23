// Vercel serverless — Stooq como fuente de precios
// Stooq: gratuito, sin API key, datos globales incluida Colombia BVC
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  
  function toStooq(sym) {
    const s = sym.toLowerCase();
    if (s.endsWith('.cl')) return s; // Colombia BVC: PFCIBEST.CL → pfcibest.cl
    if (!s.includes('.')) return s + '.us'; // US: AAPL → aapl.us
    return s;
  }

  const results = await Promise.allSettled(
    tickers.map(async (symbol) => {
      const stooqSym = toStooq(symbol);
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=json`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await r.json();
      const row = data?.symbols?.[0];

      // Stooq devuelve claves en minúscula: open, high, low, close
      if (!row || row.close == null) {
        throw new Error('Sin datos para ' + symbol + ' en Stooq');
      }

      const close = parseFloat(row.close);
      const open = parseFloat(row.open);
      const change = close - open;
      const changePct = open > 0 ? (change / open) * 100 : 0;
      const currency = symbol.endsWith('.CL') ? 'COP' : 'USD';

      return {
        symbol,
        regularMarketPrice: close,
        regularMarketChange: change,
        regularMarketChangePercent: changePct,
        regularMarketPreviousClose: open,
        shortName: symbol,
        currency,
      };
    })
  );

  const result = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed = [];
  results.forEach((r, i) => { if (r.status === 'rejected') failed.push(tickers[i] + ': ' + r.reason?.message); });

  return res.json({
    quoteResponse: { result, error: failed.length ? failed.join('; ') : null },
  });
}