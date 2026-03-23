export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbols } = req.query;
  const symbol = (symbols || 'AAPL').split(',')[0].trim();
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    const r = await fetch(`https://finance.yahoo.com/quote/${symbol}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow'
    });
    const html = await r.text();
    // Buscar fragmentos con precio
    const idx = html.indexOf('regularMarketPrice');
    const idx2 = html.indexOf('StreamerData');
    const idx3 = html.indexOf('QuoteSummaryStore');
    return res.json({
      status: r.status,
      htmlLen: html.length,
      regularMarketPriceIdx: idx,
      snippet_price: idx >= 0 ? html.substring(idx, idx + 200) : 'NOT FOUND',
      streamerIdx: idx2,
      snippet_streamer: idx2 >= 0 ? html.substring(idx2, idx2 + 200) : 'NOT FOUND',
      quoteSummaryIdx: idx3,
      snippet_quoteSummary: idx3 >= 0 ? html.substring(idx3, idx3 + 200) : 'NOT FOUND',
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}