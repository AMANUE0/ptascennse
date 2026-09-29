const assert=require('node:assert/strict');
const Module=require('node:module');
const {once}=require('node:events');
const {WebSocket}=require('ws');
const original=Module._load;
let status='Detenido',action=null,revoked=false;
process.env.PORT='3198';process.env.HOSTNAME='127.0.0.1';
Module._load=function(request,parent,isMain){
  if(request==='next')return()=>({prepare:async()=>{},getUpgradeHandler:()=>((_req,socket)=>socket.destroy()),getRequestHandler:()=>((req,res)=>{
    const user=req.headers.cookie;
    if(!['owner','member'].includes(user)){res.writeHead(401);res.end('{}');return}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({servers:revoked&&user==='member'?[]:[{id:'shared',status,pendingAction:action,isSubuser:user==='member',permissions:user==='member'?{'server.read':true}:{}}]}));
  })});
  return original.call(this,request,parent,isMain);
};
const {server,wss}=require('../server.cjs');
const connections=[];
const deadline=(promise)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('WebSocket test timed out')),5000);timer.unref()})]);
async function connect(cookie){const ws=new WebSocket('ws://127.0.0.1:3198/ws/panel',{headers:{Cookie:cookie,Origin:'http://127.0.0.1:3198'}});connections.push(ws);const frame=deadline(once(ws,'message'));await once(ws,'open');await frame;return ws;}
async function main(){
  await once(server,'listening');
  const owner=await connect('owner'),member=await connect('member');
  const ownerFrame=deadline(once(owner,'message')),memberFrame=deadline(once(member,'message'));
  action='start';status='Iniciando';globalThis.craftpanelNotify();
  const [a,b]=await Promise.all([ownerFrame,memberFrame]);
  assert.equal(JSON.parse(a[0].toString()).servers[0].pendingAction,'start');assert.equal(JSON.parse(b[0].toString()).servers[0].pendingAction,'start');
  console.log('PASS Two authenticated clients receive the same pending action');
  const revokedFrame=deadline(once(member,'message'));revoked=true;globalThis.craftpanelNotify();assert.deepEqual(JSON.parse((await revokedFrame)[0].toString()).servers,[]);
  console.log('PASS Revoked membership disappears from the next snapshot');
  const outsider=new WebSocket('ws://127.0.0.1:3198/ws/panel',{headers:{Cookie:'stranger',Origin:'http://127.0.0.1:3198'}});connections.push(outsider);outsider.on('error',()=>{});
  const response=await deadline(once(outsider,'unexpected-response'));assert.equal(response[1].statusCode,401);outsider.terminate();
  console.log('PASS Unauthenticated WebSocket rejected');
  const foreign=new WebSocket('ws://127.0.0.1:3198/ws/panel',{headers:{Cookie:'owner',Origin:'https://foreign.example'}});connections.push(foreign);await deadline(new Promise(resolve=>foreign.once('error',resolve)));
  console.log('PASS Cross-origin WebSocket rejected');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const ws of connections)ws.terminate();wss.close();server.close();server.closeAllConnections();});
