const KEY = (process.env.OPINET_KEY || '').trim();

const AREAS = {
  yongsan: { district: '용산구', code: '0110' },
  mapo: { district: '마포구', code: '0109' },
  seodaemun: { district: '서대문구', code: '0114' }
};

function decodeHtml(s = '') {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(body, name) {
  const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeHtml(m[1].trim()) : '';
}

function oilBlocks(xml = '') {
  return [...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)].map(m => m[1]);
}

async function opinet(endpoint, params = {}) {
  if (!KEY) throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  const url = new URL(`https://www.opinet.co.kr/api/${endpoint}`);
  url.searchParams.set('out', 'xml');
  url.searchParams.set('code', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const response = await fetch(url.toString(), { cache: 'no-store' });
  const text = await response.text();
  return { status: response.status, text };
}

async function getLowPrice(district, code, prodcd) {
  const result = await opinet('lowTop10.do', { prodcd, area: code, cnt: 20 });
  const blocks = oilBlocks(result.text);
  const stations = blocks.map(b => ({
    id: tag(b, 'UNI_ID'),
    name: tag(b, 'OS_NM'),
    price: Number((tag(b, 'PRICE') || '0').replace(/,/g, '')),
    brand: tag(b, 'POLL_DIV_CD') || tag(b, 'POLL_DIV_CO'),
    address: tag(b, 'NEW_ADR') || tag(b, 'VAN_ADR'),
    district
  })).filter(x => x.name && x.price > 0);
  return { stations, raw: result.text };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  try {
    const prodcd = req.query?.prodcd || 'B027';
    const area = req.query?.area || 'both';
    const targets = [];
    if (area === 'both' || area === 'yongsan') targets.push(AREAS.yongsan);
    if (area === 'both' || area === 'mapo') targets.push(AREAS.mapo);
    if (area === 'both' || area === 'seodaemun') targets.push(AREAS.seodaemun);
    if (!targets.length) return res.status(400).json({ ok: false, error: '잘못된 지역값입니다.' });

    const stations = [];
    const debug = [];
    for (const target of targets) {
      const result = await getLowPrice(target.district, target.code, prodcd);
      stations.push(...result.stations);
      debug.push({ district: target.district, areaCode: target.code, count: result.stations.length });
    }
    stations.sort((a, b) => a.price - b.price);
    if (!stations.length) return res.status(502).json({ ok: false, error: '오피넷 가격 데이터가 없습니다.', prodcd, debug });
    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      detectedAreas: { yongsan: AREAS.yongsan, mapo: AREAS.mapo, seodaemun: AREAS.seodaemun },
      stations
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
