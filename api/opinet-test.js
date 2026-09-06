const KEY = (process.env.OPINET_KEY || '').trim();

async function call(url) {
  const response = await fetch(url, {
    cache: 'no-store'
  });

  const text = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    text
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (!KEY) {
      return res.status(500).json({
        ok: false,
        error: 'OPINET_KEY 없음'
      });
    }

    const tests = [];

    // 1. 전국 시도 조회 - JSON
    {
      const url =
        `https://www.opinet.co.kr/api/areaCode.do?out=json&certkey=${encodeURIComponent(KEY)}`;

      const r = await call(url);

      tests.push({
        name: 'areaCode-json-no-area',
        status: r.status,
        preview: r.text.slice(0, 1500)
      });
    }

    // 2. 서울 시군구 조회 - JSON
    {
      const url =
        `https://www.opinet.co.kr/api/areaCode.do?out=json&area=01&certkey=${encodeURIComponent(KEY)}`;

      const r = await call(url);

      tests.push({
        name: 'areaCode-json-seoul',
        status: r.status,
        preview: r.text.slice(0, 1500)
      });
    }

    // 3. 전국 시도 조회 - XML
    {
      const url =
        `https://www.opinet.co.kr/api/areaCode.do?out=xml&certkey=${encodeURIComponent(KEY)}`;

      const r = await call(url);

      tests.push({
        name: 'areaCode-xml-no-area',
        status: r.status,
        preview: r.text.slice(0, 1500)
      });
    }

    // 4. 서울 시군구 조회 - XML
    {
      const url =
        `https://www.opinet.co.kr/api/areaCode.do?out=xml&area=01&certkey=${encodeURIComponent(KEY)}`;

      const r = await call(url);

      tests.push({
        name: 'areaCode-xml-seoul',
        status: r.status,
        preview: r.text.slice(0, 1500)
      });
    }

    return res.status(200).json({
      ok: true,
      keyConfigured: true,
      keyLength: KEY.length,
      tests
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message
    });
  }
};
