// DEV-ONLY stand-in that speaks the player control protocol, to test the adapter without the real player.
const http=require('http');let st={state:'stopped',artist:'Mock',title:'-',playlist:''},n=0;
http.createServer((q,s)=>{if(q.headers.authorization!=='Bearer devtoken'){s.writeHead(401);return s.end()}
 let b='';q.on('data',d=>b+=d);q.on('end',()=>{const j=b?JSON.parse(b):{};
  if(q.url==='/api/playlist'){st.playlist=j.name;st.title='Track '+(++n)}
  else if(q.url==='/api/play')st.state='playing';else if(q.url==='/api/pause')st.state='paused';else if(q.url==='/api/next')st.title='Track '+(++n);
  s.writeHead(200,{'Content-Type':'application/json'});s.end(JSON.stringify(st))})}).listen(9777,'127.0.0.1');
