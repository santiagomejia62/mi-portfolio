// Vercel serverless — Yahoo Finance HTML scraper
// Scrapea la página pública de Yahoo Finance que sí es accesible sin auth
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const { symbols } = req.query;
  if (!symbols?.trim()) return res.json({ quoteResponse: { result: [], error: null } });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const results = await Promise.allSettled(
    tickers.map(async (symbol) => {
      const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
      });
      const html = await r.text();

      // Extraer datos del JSON embebido en la página
      // Yahoo Finance embeds data in script tags
      const getNum = (key) => {
        const m = html.match(new RegExp('"' + key + '":\{"raw":(-?[\d.]+)'));
        return m ? parseFloat(m[1]) : null;
      };
      const getStr = (key) => {
        const m = html.match(new RegExp('"' + key + '":"([^"]+)"'));
        return m ? m[1] : null;
      };

      const price = getNum('regularMarketPrice');
      if (!price) throw new Error('no price found for ' + symbol);

      return {
        symbol,
        regularMarketPrice: price,
        regularMarketChange: getNum('regularMarketChange') ?? 0,
        regularMarketChangePercent: getNum('regularMarketChangePercent') ?? 0,
        regularMarketPreviousClose: getNum('regularMarketPreviousClose'),
        shortName: getStr('shortName') || symbol,
        currency: getStr('currency') || 'USD',
      };
    })
  );

  const result = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = tickers.filter((_, i) => results[i].status === 'rejected');

  return res.json({
    quoteResponse: {
      result,
      error: failed.length ? `No data for: ${failed.join(', ')}` : null,
    },
  });
}
