const KEY=(process.env.OPINET_KEY||'').trim();

function dec(s=''){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function tag(b,n){const m=b.match(new RegExp(`<${n}>([\\s\\S]*?)<\\/${n}>`,'i'));return m?dec(m[1].trim()):''}
function blocks(xml){return[...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)].map(m=>m[1])}

async function rawRequest(endpoint,params={},authName='certkey'){
  if(!KEY)throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  const u=new URL('https://www.opinet.co.kr/api/'+endpoint);
  u.searchParams.set('out','xml');
  u.searchParams.set(authName,KEY);
  for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  const r=await fetch(u.toString(),{cache:'no-store'});
  const text=await r.text();
  if(!r.ok)throw new Error('오피넷 HTTP '+r.status);
  return text;
}

async function request(endpoint,params={}){
  // 공식 문서는 certkey를 사용하지만, 일부 발급키/게이트웨이는 code를 쓰는 사례가 있어 둘 다 시도한다.
  let text=await rawRequest(endpoint,params,'certkey');
  if(blocks(text).length) return text;
  text=await rawRequest(endpoint,params,'code');
  return text;
}

async function getAreas(){
  const xml=await request('areaCode.do',{area:'01'});
  const rows=blocks(xml).map(b=>({code:tag(b,'AREA_CD'),name:tag(b,'AREA_NM')}));
  const y=rows.find(x=>x.name==='용산구');
  const m=rows.find(x=>x.name==='마포구');
  if(y&&m)return {yongsan:{district:'용산구',code:y.code},mapo:{district:'마포구',code:m.code}};
  // 공식 areaCode 응답을 못 받는 키 유형을 위한 보조값
  return {yongsan:{district:'용산구',code:'0110'},mapo:{district:'마포구',code:'0109'}};
}

async function lowTop(code,prodcd){
  const xml=await request('lowTop10.do',{prodcd,area:code,cnt:'20'});
  const rows=blocks(xml).map(b=>({
    id:tag(b,'UNI_ID'),
    name:tag(b,'OS_NM'),
    price:Number((tag(b,'PRICE')||'0').replace(/,/g,'')),
    brand:tag(b,'POLL_DIV_CD')||tag(b,'POLL_DIV_CO'),
    address:tag(b,'NEW_ADR')||tag(b,'VAN_ADR')
  })).filter(x=>x.name&&x.price>0);
  return {rows,rawCount:blocks(xml).length};
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const prodcd=req.query?.prodcd||'B027';
    const area=req.query?.area||'both';
    const areas=await getAreas();
    const targets=[];
    if(area==='both'||area==='yongsan')targets.push(areas.yongsan);
    if(area==='both'||area==='mapo')targets.push(areas.mapo);

    const debug=[];
    const chunks=[];
    for(const t of targets){
      const r=await lowTop(t.code,prodcd);
      debug.push({district:t.district,code:t.code,rawCount:r.rawCount,usableCount:r.rows.length});
      chunks.push(r.rows.map(x=>({...x,district:t.district})));
    }

    const stations=chunks.flat().sort((a,b)=>a.price-b.price);
    if(!stations.length){
      return res.status(502).json({ok:false,error:'오피넷 가격 데이터가 비어 있습니다.',debug});
    }
    return res.status(200).json({ok:true,updatedAt:new Date().toISOString(),stations});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
};
