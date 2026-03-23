export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbols } = req.query;
  const symbol = (symbols || 'AAPL').split(',')[0].trim().toUpperCase();
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    const r = await fetch(`https://finance.yahoo.com/quote/${symbol}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow'
    });
    const html = await r.text();
    // Buscar el símbolo en el HTML y extraer precio de ese contexto
    const symPattern = '"symbol":"' + symbol + '"';
    const idx = html.indexOf(symPattern);
    const ctx = idx >= 0 ? html.substring(idx, idx + 2000) : '';
    const priceInCtx = ctx.match(/"regularMarketPrice":\{"raw":(-?[\d.]+)/);
    
    // También probar buscar "AAPL":{"regularMarketPrice":
    const altPattern = '"' + symbol + '":{';
    const idx2 = html.indexOf(altPattern);
    const ctx2 = idx2 >= 0 ? html.substring(idx2, idx2 + 500) : '';
    
    return res.json({
      htmlLen: html.length,
      symIdx: idx,
      symCtxSnippet: ctx.substring(0, 400),
      priceInCtx: priceInCtx ? priceInCtx[1] : 'NOT FOUND',
      altIdx: idx2,
      altCtxSnippet: ctx2.substring(0, 200),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}