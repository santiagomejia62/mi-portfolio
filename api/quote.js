// Vercel serverless — Yahoo Finance proxy con flujo completo de cookies + crumb
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const BASE_HEADERS = {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  try {
    // Paso 1: Obtener cookies iniciales de Yahoo Finance (endpoint ligero)
    const cookieRes = await fetch('https://fc.yahoo.com/', {
      headers: { ...BASE_HEADERS, 'Accept': 'text/html' },
      redirect: 'follow',
    });
    // Extraer cookies del header (getSetCookie devuelve array en Node 18+)
    const rawCookies = typeof cookieRes.headers.getSetCookie === 'function'
      ? cookieRes.headers.getSetCookie()
      : (cookieRes.headers.get('set-cookie') || '').split(',');
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Paso 2: Obtener crumb con las cookies
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/csrfToken', {
      headers: { ...BASE_HEADERS, 'Accept': 'application/json', 'Cookie': cookieStr, 'Referer': 'https://finance.yahoo.com/' },
    });
    const crumbData = await crumbRes.json().catch(() => ({}));
    const crumb = crumbData?.data || crumbData?.crumb || '';

    // Paso 3: Cotizaciones con crumb + cookies
    const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,currency';
    const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}${crumbParam}`;

    const quoteRes = await fetch(url, {
      headers: { ...BASE_HEADERS, 'Accept': 'application/json, */*', 'Cookie': cookieStr, 'Referer': 'https://finance.yahoo.com/' },
    });

    if (!quoteRes.ok) {
      const errBody = await quoteRes.text().catch(() => '');
      return res.status(quoteRes.status).json({
        quoteResponse: { result: [], error: `Yahoo ${quoteRes.status}: ${errBody.substring(0, 100)}` },
      });
    }

    const data = await quoteRes.json();
    if (!data?.quoteResponse) return res.status(502).json({ quoteResponse: { result: [], error: 'Respuesta vacía' } });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ quoteResponse: { result: [], error: e.message } });
  }
}
