const KEY=(process.env.OPINET_KEY||'').trim();

// 오피넷 서울 시군구 코드
// 마포구 0109 / 용산구 0110
const AREA_CODES={
  yongsan:{district:'용산구',code:'0110'},
  mapo:{district:'마포구',code:'0109'}
};

function dec(s=''){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function tag(b,n){const m=b.match(new RegExp(`<${n}>([\\s\\S]*?)<\\/${n}>`,'i'));return m?dec(m[1].trim()):''}
function blocks(xml){return[...xml.matchAll(/<OIL>([\s\S]*?)<\/OIL>/gi)].map(m=>m[1])}

async function request(endpoint,params={}){
  if(!KEY)throw new Error('OPINET_KEY가 설정되지 않았습니다.');
  const u=new URL('https://www.opinet.co.kr/api/'+endpoint);
  u.searchParams.set('out','xml');
  u.searchParams.set('certkey',KEY);
  for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  const r=await fetch(u.toString(),{cache:'no-store'});
  const text=await r.text();
  if(!r.ok)throw new Error('오피넷 HTTP '+r.status);
  const err=tag(text,'ERROR')||tag(text,'ERR_MSG')||tag(text,'MESSAGE');
  if(err)throw new Error('오피넷: '+err);
  return text;
}

async function lowTop(code,prodcd){
  const xml=await request('lowTop10.do',{prodcd,area:code,cnt:'20'});
  return blocks(xml).map(b=>({
    id:tag(b,'UNI_ID'),
    name:tag(b,'OS_NM'),
    price:Number((tag(b,'PRICE')||'0').replace(/,/g,'')),
    brand:tag(b,'POLL_DIV_CD')||tag(b,'POLL_DIV_CO'),
    address:tag(b,'NEW_ADR')||tag(b,'VAN_ADR')
  })).filter(x=>x.name&&x.price>0);
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const prodcd=req.query?.prodcd||'B027';
    const area=req.query?.area||'both';
    const targets=[];
    if(area==='both'||area==='yongsan')targets.push(AREA_CODES.yongsan);
    if(area==='both'||area==='mapo')targets.push(AREA_CODES.mapo);
    const chunks=await Promise.all(targets.map(async t=>(await lowTop(t.code,prodcd)).map(x=>({...x,district:t.district}))));
    const stations=chunks.flat().sort((a,b)=>a.price-b.price);
    if(!stations.length)throw new Error('오피넷에서 현재 가격 데이터가 반환되지 않았습니다.');
    return res.status(200).json({ok:true,updatedAt:new Date().toISOString(),stations});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
};
