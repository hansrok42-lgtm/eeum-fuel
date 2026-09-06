const KEY = process.env.OPINET_KEY || '';

async function api(endpoint, params = {}) {
  if (!KEY) throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  const u = new URL('https://www.opinet.co.kr/api/' + endpoint);
  u.searchParams.set('out', 'json');
  u.searchParams.set('certkey', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error('오피넷 HTTP ' + r.status);
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error('오피넷 응답 형식 오류'); }
}

function oils(d) {
  const x = d && d.RESULT && d.RESULT.OIL ? d.RESULT.OIL : [];
  return Array.isArray(x) ? x : (x ? [x] : []);
}

let areaCache = null;
async function getAreas() {
  if (areaCache) return areaCache;
  const rows = oils(await api('areaCode.do', { area: '01' }));
  const out = {};
  for (const x of rows) {
    if (x.AREA_NM === '용산구') out.yongsan = x.AREA_CD;
    if (x.AREA_NM === '마포구') out.mapo = x.AREA_CD;
  }
  if (!out.yongsan || !out.mapo) throw new Error('지역코드를 찾지 못했습니다.');
  areaCache = out;
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const prodcd = (req.query && req.query.prodcd) || 'B027';
    const area = (req.query && req.query.area) || 'both';
    const c = await getAreas();
    const targets = [];
    if (area === 'both' || area === 'yongsan') targets.push(['용산구', c.yongsan]);
    if (area === 'both' || area === 'mapo') targets.push(['마포구', c.mapo]);

    const chunks = await Promise.all(targets.map(async ([district, code]) => {
      const rows = oils(await api('lowTop10.do', { prodcd, area: code, cnt: 20 }));
      return rows.map(x => ({
        id: x.UNI_ID || '',
        name: x.OS_NM || '',
        price: Number(x.PRICE || 0),
        brand: x.POLL_DIV_CD || '',
        address: x.NEW_ADR || x.VAN_ADR || '',
        district
      }));
    }));

    const stations = chunks.flat().filter(x => x.price > 0).sort((a, b) => a.price - b.price);
    res.status(200).json({ ok: true, updatedAt: new Date().toISOString(), stations });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
