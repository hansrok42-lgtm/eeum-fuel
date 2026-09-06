const KEY = (process.env.OPINET_KEY || '').trim();

// Opinet Seoul sigungu codes: Mapo 0114, Yongsan 0103.
const AREA_CODES = {
  mapo: { district: '마포구', code: '0114' },
  yongsan: { district: '용산구', code: '0103' }
};

function decodeXml(s = '') {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

async function lowTop(areaCode, prodcd) {
  if (!KEY) throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  const u = new URL('https://www.opinet.co.kr/api/lowTop10.do');
  u.searchParams.set('out', 'xml');
  u.searchParams.set('certkey', KEY);
  u.searchParams.set('area', areaCode);
  u.searchParams.set('prodcd', prodcd);
  u.searchParams.set('cnt', '20');

  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error('오피넷 HTTP ' + r.status);
  const xml = await r.text();
  const blocks = [...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)].map(m => m[1]);
  return blocks.map(b => ({
    id: tag(b, 'UNI_ID'), name: tag(b, 'OS_NM'),
    price: Number((tag(b, 'PRICE') || '0').replace(/,/g, '')),
    brand: tag(b, 'POLL_DIV_CO') || tag(b, 'POLL_DIV_CD'),
    address: tag(b, 'NEW_ADR') || tag(b, 'VAN_ADR')
  })).filter(x => x.name && x.price > 0);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const prodcd = (req.query && req.query.prodcd) || 'B027';
    const area = (req.query && req.query.area) || 'both';
    const targets = [];
    if (area === 'both' || area === 'yongsan') targets.push(AREA_CODES.yongsan);
    if (area === 'both' || area === 'mapo') targets.push(AREA_CODES.mapo);
    const chunks = await Promise.all(targets.map(async t => (await lowTop(t.code, prodcd)).map(x => ({ ...x, district: t.district }))));
    const stations = chunks.flat().sort((a, b) => a.price - b.price);
    if (!stations.length) throw new Error('오피넷 응답에 주유소 데이터가 없습니다. 인증키 활성화 상태를 확인해주세요.');
    res.status(200).json({ ok: true, updatedAt: new Date().toISOString(), stations });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
