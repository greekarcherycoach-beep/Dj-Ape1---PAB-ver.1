// Overnight show unit test with a faked clock (Europe/Athens).
const RealDate=Date;let fake=null;
global.Date=class extends RealDate{constructor(...a){a.length?super(...a):super(fake??RealDate.now())}static now(){return fake??RealDate.now()}};
const S=require('./engine/scheduler');const fs=require('fs');const f='/tmp/sched_t.json';fs.writeFileSync(f,'[]');
const ev=[];const s=S.create({file:f,tz:'Europe/Athens',log:()=>{},onChange:x=>ev.push(x&&x.name)});
s.add({name:'Night',days:[2],start:'23:00',end:'01:00'}); // Tuesday 23:00 -> Wednesday 01:00
const at=(iso)=>{fake=RealDate.parse(iso);s.tick();return s.current()&&s.current().name};
// 2026-11-17 is Tuesday; Athens = UTC+2 in November
const t=[['2026-11-17T22:00:00+02:00',undefined],['2026-11-17T23:30:00+02:00','Night'],['2026-11-18T00:30:00+02:00','Night'],['2026-11-18T01:30:00+02:00',undefined],['2026-11-18T23:30:00+02:00',undefined]];
let bad=0;for(const[i,w]of t){const g=at(i)||undefined;const ok=g===w;if(!ok)bad++;console.log(ok?'PASS':'FAIL',i,g)}
process.exit(bad?1:0)
