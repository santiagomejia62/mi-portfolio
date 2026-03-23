// Vercel serverless — Stooq como fuente de precios (sin API key, CORS-free)
// BVC Colombia (.CL): Stooq no tiene cobertura, se retorna error específico
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  // BVC Colombia (.CL): Stooq no indexa la BVC — devolver error específico de inmediato
  const bvcTickers = tickers.filter(t => t.endsWith('.CL'));
  const stooqTickers = tickers.filter(t => !t.endsWith('.CL'));

  function toStooq(sym) {
    const s = sym.toLowerCase();
    if (!s.includes('.')) return s + '.us';  // AAPL → aapl.us
    return s;
  }

  const results = await Promise.allSettled(
    stooqTickers.map(async (symbol) => {
      const stooqSym = toStooq(symbol);
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=json`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await r.json();
      const row = data?.symbols?.[0];
      if (!row || row.close == null) throw new Error('Sin datos para ' + symbol);
      const close = parseFloat(row.close);
      const open = parseFloat(row.open);
      const change = close - open;
      const changePct = open > 0 ? (change / open) * 100 : 0;
      return {
        symbol,
        regularMarketPrice: close,
        regularMarketChange: change,
        regularMarketChangePercent: changePct,
        regularMarketPreviousClose: open,
        shortName: symbol,
        currency: 'USD',
      };
    })
  );

  const result = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') failed.push(stooqTickers[i] + ': ' + r.reason?.message);
  });
  bvcTickers.forEach(t => {
    failed.push(t + ': BVC_NO_DATA');
  });

  return res.json({
    quoteResponse: {
      result,
      error: failed.length ? failed.join('; ') : null,
      bvcUnavailable: bvcTickers,
    },
  });
}
