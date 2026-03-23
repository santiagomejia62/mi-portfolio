// Vercel serverless function — proxy para Yahoo Finance Quote
// Usa el flujo de crumb para evitar el bloqueo anti-bot de Yahoo Finance
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const { symbols } = req.query;
  if (!symbols || symbols.trim().length < 1) {
    return res.json({ quoteResponse: { result: [], error: null } });
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  try {
    // Paso 1: Obtener crumb + cookies de Yahoo Finance
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/csrfToken', {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      },
    });

    const setCookieHeader = crumbRes.headers.get('set-cookie') || '';
    let crumb = null;
    try {
      const crumbData = await crumbRes.json();
      crumb = crumbData?.data || crumbData?.crumb || null;
    } catch (_) {}

    const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,currency';
    const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}${crumbParam}`;

    // Paso 2: Solicitar cotizaciones con crumb y cookies
    const quoteRes = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
        'Cookie': setCookieHeader,
      },
    });

    if (!quoteRes.ok) {
      return res.status(quoteRes.status).json({
        quoteResponse: { result: [], error: `Yahoo HTTP ${quoteRes.status}` },
      });
    }

    const data = await quoteRes.json();

    if (!data?.quoteResponse) {
      return res.status(502).json({
        quoteResponse: { result: [], error: 'Respuesta vacía de Yahoo Finance' },
      });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ quoteResponse: { result: [], error: e.message } });
  }
}
