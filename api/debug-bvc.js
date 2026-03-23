// Endpoint temporal de diagnóstico — ver qué devuelve Google Finance para BVC
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sym = (req.query.sym || 'PFBCOLOM').toUpperCase();
  const url = `https://www.google.com/finance/quote/${sym}:BVC`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await r.text();
    const len = html.length;

    // Extraer snippets relevantes
    const snippets = {
      status: r.status,
      htmlLength: len,
      // Método 1: clase YMlKec
      YMlKec: (html.match(/YMlKec[^<]{0,80}/g) || []).slice(0, 5),
      // data-last-price
      dataLastPrice: (html.match(/data-last-price="[^"]+"/g) || []).slice(0, 3),
      // Numbers that look like COP prices (thousands range)
      bigNumbers: (html.match(/\b\d{2,3}[,.]?\d{3}(?:[.,]\d{2})?\b/g) || []).filter(n => {
        const v = parseFloat(n.replace(/,/g, '').replace(/\./g, ''));
        return v > 1000 && v < 200000;
      }).slice(0, 10),
      // Primer bloque con el símbolo
      symContext: (() => {
        const idx = html.indexOf(sym);
        return idx > -1 ? html.slice(Math.max(0, idx - 50), idx + 200) : 'not found';
      })(),
      // class="YMlKec con contexto
      priceBlock: (() => {
        const m = html.match(/class="YMlKec[^"]*"[^>]*>[\s\S]{0,100}/);
        return m ? m[0] : 'not found';
      })(),
      // Primeros 500 chars del body (para ver si es SSR o SPA shell)
      bodyStart: html.slice(html.indexOf('<body'), html.indexOf('<body') + 500),
      // Buscar patrones de precio
      priceCandidates: (() => {
        const matches = [];
        // Formato: $65,800 o COP 65.800
        const re = /(?:COP|USD|\$|₡)\s*([\d,. ]+)/gi;
        let m;
        while ((m = re.exec(html)) !== null && matches.length < 5) {
          matches.push(m[0]);
        }
        return matches;
      })(),
    };

    return res.json(snippets);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
