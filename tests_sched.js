// Scheduler + player integration test (uses tools/mock-player.js as a DEV stand-in for the real player).
const http=require('http'),fs=require('fs'),{nowIn}=require('./engine/scheduler');
const A=fs.readFileSync(__dirname+'/data/admin.token','utf8').trim();
const call=(m,p,b)=>new Promise(r=>{const q=http.request({port:8080,path:p,method:m,headers:{'x-admin-token':A}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>r({st:s.statusCode,j:JSON.parse(d||'{}')}))});b&&q.write(JSON.stringify(b));q.end()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
(async()=>{const n=nowIn('Europe/Athens'),hm=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const a=await call('POST','/api/schedule',{name:'Now Show',days:[n.day],start:hm(n.min-1),end:hm(n.min+30),genre:'Jazz',playlist:'JazzList'});ok('show added',!a.j.error);
 const o=await call('POST','/api/schedule',{name:'Clash',days:[n.day],start:hm(n.min),end:hm(n.min+10)});ok('overlap rejected 409',o.st===409);
 await sleep(2500);let s=await call('GET','/api/status');ok('NOW show in meta',s.j.meta.show==='Now Show');
 let p=await call('GET','/api/player');ok('player got playlist+playing',p.j.connected&&p.j.playlist==='JazzList'&&p.j.state==='playing');ok('track metadata from player',/Track/.test(s.j.meta.title));
 await call('POST','/api/override',{show:{name:'Έκτακτη',playlist:'Special'},minutes:5});await sleep(2200);
 p=await call('GET','/api/player');ok('override switched playlist',p.j.playlist==='Special');
 await call('POST','/api/override',{clear:true});await sleep(2200);p=await call('GET','/api/player');ok('back to schedule',p.j.playlist==='JazzList');
 const g=await call('GET','/guide?code=x');ok('guide needs code',g.st===403);
 console.log('KILL_PLAYER');await sleep(100);process.exit(0)})();
