const KEY = (process.env.OPINET_KEY || '').trim();

function decodeHtml(s = '') {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(body, name) {
  const m = body.match(
    new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i')
  );
  return m ? decodeHtml(m[1].trim()) : '';
}

function oilBlocks(xml = '') {
  return [...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)].map(m => m[1]);
}

async function callOpinet(endpoint, params = {}) {
  if (!KEY) {
    throw new Error('Vercel의 OPINET_KEY 환경변수가 없습니다.');
  }

  const url = new URL(`https://www.opinet.co.kr/api/${endpoint}`);

  url.searchParams.set('out', 'xml');
  url.searchParams.set('certkey', KEY);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  const text = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    text
  };
}

async function getStations(district, code, prodcd) {
  const result = await callOpinet('lowTop10.do', {
    prodcd,
    area: code,
    cnt: 20
  });

  const blocks = oilBlocks(result.text);

  const rows = blocks
    .map(b => ({
      id: tag(b, 'UNI_ID'),
      name: tag(b, 'OS_NM'),
      price: Number((tag(b, 'PRICE') || '0').replace(/,/g, '')),
      brand: tag(b, 'POLL_DIV_CO') || tag(b, 'POLL_DIV_CD'),
      address: tag(b, 'NEW_ADR') || tag(b, 'VAN_ADR'),
      district
    }))
    .filter(x => x.name && x.price > 0);

  return {
    rows,
    debug: {
      district,
      code,
      httpStatus: result.status,
      httpOk: result.ok,
      rawCount: blocks.length,
      usableCount: rows.length,

      // 오피넷에서 실제로 무엇을 보내는지 확인
      responsePreview: result.text
        .replace(/\s+/g, ' ')
        .slice(0, 1000)
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const prodcd = req.query?.prodcd || 'B027';
    const area = req.query?.area || 'both';

    const targets = [];

    if (area === 'both' || area === 'yongsan') {
      targets.push({
        district: '용산구',
        code: '0110'
      });
    }

    if (area === 'both' || area === 'mapo') {
      targets.push({
        district: '마포구',
        code: '0109'
      });
    }

    const stations = [];
    const debug = [];

    for (const target of targets) {
      const result = await getStations(
        target.district,
        target.code,
        prodcd
      );

      stations.push(...result.rows);
      debug.push(result.debug);
    }

    stations.sort((a, b) => a.price - b.price);

    if (!stations.length) {
      return res.status(502).json({
        ok: false,
        error: '오피넷 데이터 확인 필요',
        keyConfigured: Boolean(KEY),
        keyLength: KEY.length,
        prodcd,
        debug
      });
    }

    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      stations,
      debug
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message
    });
  }
};
