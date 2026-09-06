const KEY = (process.env.OPINET_KEY || '').trim();

async function call(endpoint, params = {}) {
  const url = new URL(`https://www.opinet.co.kr/api/${endpoint}`);

  url.searchParams.set('certkey', KEY);
  url.searchParams.set('out', 'json');

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store'
  });

  return {
    status: response.status,
    text: await response.text()
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const tests = [];

    const avgAll = await call('avgAllPrice.do');
    tests.push({
      name: '전국 평균가격',
      status: avgAll.status,
      preview: avgAll.text.slice(0, 2000)
    });

    const area = await call('areaCode.do');
    tests.push({
      name: '전국 지역코드',
      status: area.status,
      preview: area.text.slice(0, 2000)
    });

    const low = await call('lowTop10.do', {
      prodcd: 'B027',
      cnt: '5'
    });

    tests.push({
      name: '전국 최저가 휘발유',
      status: low.status,
      preview: low.text.slice(0, 2000)
    });

    return res.status(200).json({
      ok: true,
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
