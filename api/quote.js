// Vercel serverless — Stooq como fuente de datos de acciones
// Stooq: gratuito, sin API key, datos de bolsas globales incluida Colombia BVC
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  
  // Convertir ticker de Yahoo Finance a formato Stooq
  function toStooq(sym) {
    const s = sym.toLowerCase();
    // Colombia BVC: PFCIBEST.CL → pfcibest.cl (Stooq usa misma convención)
    if (s.endsWith('.cl')) return s;
    // US stocks: AAPL → aapl.us
    if (!s.includes('.')) return s + '.us';
    return s;
  }

  const results = await Promise.allSettled(
    tickers.map(async (symbol) => {
      const stooqSym = toStooq(symbol);
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=json`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const data = await r.json();
      const row = data?.symbols?.[0];
      
      if (!row || row.Close === undefined || row.Close === null) {
        throw new Error('No data for ' + symbol + ' (stooq: ' + stooqSym + ')');
      }
      
      const close = parseFloat(row.Close);
      const open = parseFloat(row.Open);
      const change = close - open;
      const changePct = open > 0 ? (change / open) * 100 : 0;
      
      // Detectar moneda: .CL = COP, otros = USD por defecto
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
  const failed = tickers.filter((_, i) => results[i].status === 'rejected').map((t, i) => {
    const reason = results[tickers.indexOf(t)];
    return t + (reason?.reason?.message ? ': ' + reason.reason.message : '');
  });

  return res.json({
    quoteResponse: { result, error: failed.length ? failed.join('; ') : null },
  });
}
