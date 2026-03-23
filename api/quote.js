// Vercel serverless — fuentes de precios:
//   • Stooq      → acciones US/internacionales (sin API key)
//   • Google Finance (scraping) → acciones BVC Colombia (.CL)
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

  // ── Google Finance scraping (BVC Colombia) ─────────────────────────────────
  async function fetchBVC(symbol) {
    const bvcSym = symbol.replace(/\.CL$/i, '');
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(bvcSym)}:BVC`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    if (!r.ok) throw new Error(`Google Finance HTTP ${r.status} para ${symbol}`);
    const html = await r.text();

    // ── Extraer precio ──────────────────────────────────────────────────────
    // Google Finance SSR embeds the price in multiple places; intentar varios.
    let price = null;

    // Método 1: clase YMlKec fxKbKc (precio principal en versión desktop SSR)
    const m1 = html.match(/class="YMlKec fxKbKc"[^>]*>\s*([\d,.\s]+)/);
    if (m1) {
      const raw = m1[1].replace(/\s/g, '');
      // Formato US: 65,800.00  →  65800.00
      // Formato EU: 65.800,00  →  65800.00
      price = parseNum(raw);
    }

    // Método 2: data-last-price attribute (presente en algunas variantes)
    if (price === null || isNaN(price)) {
      const m2 = html.match(/data-last-price="([\d.]+)"/);
      if (m2) price = parseFloat(m2[1]);
    }

    // Método 3: JSON embebido — buscar patrón "PFCIBEST":{"price":65800,...}
    if (price === null || isNaN(price)) {
      const re = new RegExp(`"${bvcSym}"[^}]{0,300}"price":\\s*"?([\\d.]+)"?`);
      const m3 = html.match(re);
      if (m3) price = parseFloat(m3[1]);
    }

    // Método 4: buscar el valor directamente por rango conocido (COP suele ser >1000)
    if (price === null || isNaN(price)) {
      // Buscar números de 5+ dígitos precedidos de COP o $
      const m4 = html.match(/(?:COP|₡|\$)\s*([\d,. ]{5,})/);
      if (m4) price = parseNum(m4[1].replace(/\s/g, ''));
    }

    if (!price || isNaN(price)) {
      throw new Error(`Google Finance: no se pudo extraer precio para ${symbol}`);
    }

    // ── Extraer cambio del día ──────────────────────────────────────────────
    let change = 0, changePct = 0;

    // Patrón: +1,234.00 (+1.92%) o -500 (-0.75%)
    const changeMatch = html.match(/([+-][\d,. ]+)\s*\(([+-]?[\d.]+)%\)/);
    if (changeMatch) {
      change    = parseNum(changeMatch[1]);
      changePct = parseFloat(changeMatch[2]);
      if (isNaN(change))    change = 0;
      if (isNaN(changePct)) changePct = 0;
    }

    return {
      symbol,
      regularMarketPrice:          price,
      regularMarketChange:         change,
      regularMarketChangePercent:  changePct,
      regularMarketPreviousClose:  price - change,
      shortName:                   bvcSym,
      currency:                    'COP',
    };
  }

  // Parsear número con separadores mixtos (US y EU)
  function parseNum(s) {
    if (!s) return NaN;
    s = s.trim();
    // Si termina con ,XX (2 decimales europeo) → quitar puntos de miles, coma→punto
    if (/,\d{2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    // Si termina con .XX (2 decimales US) → quitar comas de miles
    if (/\.\d{2}$/.test(s)) return parseFloat(s.replace(/,/g, ''));
    // Sin decimales visibles → quitar separadores
    return parseFloat(s.replace(/[,. ]/g, ''));
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

  // bvcUnavailable: tickers BVC que fallaron (para que el frontend los marque diferente)
  const bvcUnavailable = bvcTickers.filter((t, i) => bvcResults[i]?.status === 'rejected');

  return res.json({
    quoteResponse: {
      result,
      error: failed.length ? failed.join('; ') : null,
      bvcUnavailable,
    },
  });
}
