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
  return [...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)]
    .map(m => m[1]);
}

async function opinet(endpoint, params = {}) {
  if (!KEY) {
    throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  }

  const url = new URL(
    `https://www.opinet.co.kr/api/${endpoint}`
  );

  url.searchParams.set('out', 'xml');
  url.searchParams.set('certkey', KEY);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store'
  });

  const text = await response.text();

  return {
    status: response.status,
    text
  };
}

/* 서울의 실제 시군구 코드 조회 */
async function getSeoulAreas() {

  const result = await opinet('areaCode.do', {
    area: '01'
  });

  const blocks = oilBlocks(result.text);

  const areas = blocks.map(b => ({
    code: tag(b, 'AREA_CD'),
    name: tag(b, 'AREA_NM')
  }));

  const yongsan = areas.find(
    x => x.name.replace(/\s/g, '') === '용산구'
  );

  const mapo = areas.find(
    x => x.name.replace(/\s/g, '') === '마포구'
  );

  return {
    yongsan,
    mapo,
    allAreas: areas,
    raw: result.text
  };
}

/* 최저가 주유소 조회 */
async function getLowPrice(district, code, prodcd) {

  const result = await opinet('lowTop10.do', {
    prodcd,
    area: code,
    cnt: 20
  });

  const blocks = oilBlocks(result.text);

  const stations = blocks
    .map(b => ({
      id: tag(b, 'UNI_ID'),

      name: tag(b, 'OS_NM'),

      price: Number(
        (tag(b, 'PRICE') || '0').replace(/,/g, '')
      ),

      brand:
        tag(b, 'POLL_DIV_CD') ||
        tag(b, 'POLL_DIV_CO'),

      address:
        tag(b, 'NEW_ADR') ||
        tag(b, 'VAN_ADR'),

      district
    }))
    .filter(x => x.name && x.price > 0);

  return {
    stations,
    raw: result.text
  };
}

module.exports = async (req, res) => {

  res.setHeader('Cache-Control', 'no-store');

  try {

    const prodcd = req.query?.prodcd || 'B027';
    const area = req.query?.area || 'both';

    /* 1. 오피넷에서 서울 지역코드 직접 조회 */
    const areaResult = await getSeoulAreas();

    if (
      !areaResult.yongsan ||
      !areaResult.mapo
    ) {

      return res.status(502).json({

        ok: false,

        error:
          '오피넷에서 서울 지역코드를 가져오지 못했습니다.',

        areaCodeDebug: {
          receivedAreas: areaResult.allAreas,
          responsePreview:
            areaResult.raw
              .replace(/\s+/g, ' ')
              .slice(0, 1500)
        }

      });
    }

    const targets = [];

    if (
      area === 'both' ||
      area === 'yongsan'
    ) {
      targets.push({
        district: '용산구',
        code: areaResult.yongsan.code
      });
    }

    if (
      area === 'both' ||
      area === 'mapo'
    ) {
      targets.push({
        district: '마포구',
        code: areaResult.mapo.code
      });
    }

    /* 2. 실제 가격 조회 */
    const stations = [];
    const debug = [];

    for (const target of targets) {

      const result = await getLowPrice(
        target.district,
        target.code,
        prodcd
      );

      stations.push(...result.stations);

      debug.push({
        district: target.district,
        areaCode: target.code,
        count: result.stations.length,

        responsePreview:
          result.raw
            .replace(/\s+/g, ' ')
            .slice(0, 800)
      });
    }

    /* 가격 낮은 순 */
    stations.sort(
      (a, b) => a.price - b.price
    );

    if (!stations.length) {

      return res.status(502).json({

        ok: false,

        error:
          '지역코드는 정상 조회됐지만 가격 데이터가 없습니다.',

        detectedAreas: {
          yongsan: areaResult.yongsan,
          mapo: areaResult.mapo
        },

        prodcd,

        debug
      });
    }

    return res.status(200).json({

      ok: true,

      updatedAt:
        new Date().toISOString(),

      detectedAreas: {
        yongsan: areaResult.yongsan,
        mapo: areaResult.mapo
      },

      stations
    });

  } catch (e) {

    return res.status(500).json({
      ok: false,
      error: e.message
    });

  }
};
