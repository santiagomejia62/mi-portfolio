// Vercel serverless — fuentes de precios:
//   • Stooq              → acciones US/internacionales (sin API key)
//   • TradingView Scanner → acciones BVC Colombia (.CL) — POST sin auth
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  const bvcTickers   = tickers.filter(t => t.endsWith('.CL'));
  const stooqTickers = tickers.filter(t => !t.endsWith('.CL'));

  // ── Stooq (US & internacionales) ──────────────────────────────────────────
  function toStooq(sym) {
    const s = sym.toLowerCase();
    if (!s.includes('.')) return s + '.us'; // AAPL → aapl.us
    return s;
  }

  // ── TradingView Scanner (BVC Colombia) ────────────────────────────────────
  // Endpoint público del screener de TradingView — sin API key, sin auth
  // Documentado en github.com/shner-elmo/TradingView-Screener y variantes
  async function fetchBVC(symbol) {
    const bvcSym = symbol.replace(/\.CL$/i, '');

    const body = {
      filter: [{ left: 'name', operation: 'equal', right: bvcSym }],
      columns: ['close', 'change', 'change_abs', 'description'],
      sort: { sortBy: 'name', sortOrder: 'asc' },
      range: [0, 1],
    };

    const r = await fetch('https://scanner.tradingview.com/colombia/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/screener/',
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) throw new Error(`TradingView HTTP ${r.status} para ${symbol}`);

    const data = await r.json();
    const row = data?.data?.[0]?.d;

    if (!row || row[0] == null) {
      throw new Error(`TradingView: sin datos para ${symbol} en BVC`);
    }

    const close     = parseFloat(row[0]);                  // precio actual (COP)
    const changePct = parseFloat(row[1]) || 0;             // % cambio del día
    const changeAbs = parseFloat(row[2]) || 0;             // cambio absoluto en COP
    const desc      = String(row[3] || bvcSym);            // nombre largo

    return {
      symbol,
      regularMarketPrice:         close,
      regularMarketChange:        changeAbs,
      regularMarketChangePercent: changePct,
      regularMarketPreviousClose: close - changeAbs,
      shortName:                  desc,
      currency:                   'COP',
    };
  }

  // ── Fetch en paralelo ──────────────────────────────────────────────────────
  const [stooqResults, bvcResults] = await Promise.all([
    Promise.allSettled(
      stooqTickers.map(async (symbol) => {
        const stooqSym = toStooq(symbol);
        const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=json`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await r.json();
        const row = data?.symbols?.[0];
        if (!row || row.close == null) throw new Error('Sin datos para ' + symbol);
        const close = parseFloat(row.close);
        const open  = parseFloat(row.open);
        const change    = close - open;
        const changePct = open > 0 ? (change / open) * 100 : 0;
        return {
          symbol,
          regularMarketPrice:         close,
          regularMarketChange:        change,
          regularMarketChangePercent: changePct,
          regularMarketPreviousClose: open,
          shortName: symbol,
          currency:  'USD',
        };
      })
    ),
    Promise.allSettled(bvcTickers.map(fetchBVC)),
  ]);

  const result = [
    ...stooqResults.filter(r => r.status === 'fulfilled').map(r => r.value),
    ...bvcResults.filter(r => r.status === 'fulfilled').map(r => r.value),
  ];

  const failed = [];
  stooqResults.forEach((r, i) => {
    if (r.status === 'rejected') failed.push(stooqTickers[i] + ': ' + r.reason?.message);
  });
  bvcResults.forEach((r, i) => {
    if (r.status === 'rejected') failed.push(bvcTickers[i] + ': ' + r.reason?.message);
  });

  const bvcUnavailable = bvcTickers.filter((_, i) => bvcResults[i]?.status === 'rejected');

  return res.json({
    quoteResponse: {
      result,
      error: failed.length ? failed.join('; ') : null,
      bvcUnavailable,
    },
  });
}
