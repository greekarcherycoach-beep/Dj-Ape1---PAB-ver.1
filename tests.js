// Real network tests against a running engine: node tests.js
const http=require('http'),fs=require('fs');const A=fs.readFileSync(__dirname+'/data/admin.token','utf8').trim();
const call=(p,b)=>new Promise(r=>{const q=http.request({port:8080,path:'/api/'+p,method:b?'POST':'GET',headers:{'x-admin-token':A}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>r(JSON.parse(d)))});b&&q.write(JSON.stringify(b));q.end()});
const open=(path,slow)=>new Promise(r=>{const q=http.get({port:8080,path},s=>{let n=0;s.on('data',c=>{n+=c.length});if(slow)s.pause();r({s,status:s.statusCode,get n(){return n}})});q.on('error',()=>r({status:0}))});
(async()=>{const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
 const {code}=await call('codes',{label:'t',maxUses:20});
 ok('bad code → 403',(await open('/stream?code=bad')).status===403);
 const fast=await open(`/stream?code=${code}&name=fast`);const slow=await open(`/stream?code=${code}&name=slow&q=mp3_192`,true);
 ok('both connect',fast.status===200&&slow.status===200);
 const flac=await open(`/stream?code=${code}&name=flac&q=flac`);ok('flac connect',flac.status===200);
 const ls=[];for(let i=0;i<7;i++)ls.push(await open(`/stream?code=${code}&name=l${i}`));
 ok('10 connected',(await call('status')).connected===10);
 ok('11th → 503',(await open(`/stream?code=${code}`)).status===503);
 const b0=fast.n;await new Promise(r=>setTimeout(r,4000));
 ok('fast client keeps receiving while one is stalled',fast.n-b0>60000);
 const st=await call('status');console.log('listeners now',st.connected,'encoders',JSON.stringify(st.encoders));
 // late joiner on flac gets header
 const late=await open(`/stream?code=${code}&q=flac`);await new Promise(r=>setTimeout(r,1500));
 ok('late flac joiner receives data',late.n>0);
 process.exit(0)})();
