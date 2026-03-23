export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=json', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }
    });
    const text = await r.text();
    return res.json({ status: r.status, snippet: text.substring(0, 500) });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}