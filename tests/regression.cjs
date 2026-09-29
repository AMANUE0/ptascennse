const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const TOML = require('@iarna/toml');
const YAML = require('yaml');
const root = path.resolve(__dirname,'..');
const fixture = path.join(root,'.test-work',String(Date.now()));
const mocks = new Map();
const originalLoad = Module._load;
Module._load = function(request,parent,isMain) {
  if (mocks.has(request)) return mocks.get(request);
  if (request.startsWith('@/')) request = path.join(root,request.slice(2));
  return originalLoad.call(this,request,parent,isMain);
};
require.extensions['.ts'] = (module,filename) => {
  const source = fs.readFileSync(filename,'utf8');
  module._compile(ts.transpileModule(source,{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,filename);
};
let passed = 0;
async function test(name,run) { await run(); passed++; console.log('PASS',name); }
const baseConfig = { bind:'0.0.0.0:25565',onlineMode:true,playerInfoForwarding:'modern',servers:[{name:'lobby',address:'127.0.0.1:25566',priority:1}] };
async function main() {
  const config = require('../lib/network-config.ts');
  await test('Velocity root keys stay at root and existing sections survive',()=>{
    const output=TOML.parse(config.velocityText('[servers]\nold="127.0.0.1:1"\n[advanced]\ncompression-threshold=256\n',baseConfig));
    assert.equal(output.bind,baseConfig.bind); assert.equal(output['online-mode'],true); assert.equal(output.advanced['compression-threshold'],256); assert.deepEqual(output.servers.try,['lobby']); assert.equal(output.servers.old,undefined);
  });
  await test('Velocity rejects duplicate names and injection',()=>{
    assert.throws(()=>config.velocityText('',{...baseConfig,servers:[baseConfig.servers[0],baseConfig.servers[0]]}));
    assert.throws(()=>config.velocityText('',{...baseConfig,servers:[{...baseConfig.servers[0],name:'evil\n[advanced]'}]}));
  });
  await test('Properties replaces duplicate values and preserves unrelated settings',()=>{
    const result=config.propertiesText('# greeting\nonline-mode=true\nonline-mode=true\nmotd=hello\n',{'online-mode':false});
    assert.equal((result.match(/online-mode=/g)||[]).length,1); assert.match(result,/motd=hello/); assert.match(result,/online-mode=false/); assert.match(result,/# greeting/);
  });
  await test('YAML retains unrelated settings and rejects malformed source',()=>{
    const text=config.yamlText('proxies:\n  bungee-cord:\n    online-mode: true\n',[[['proxies','velocity','enabled'],true]]);
    assert.equal(YAML.parse(text).proxies['bungee-cord']['online-mode'],true); assert.equal(YAML.parse(text).proxies.velocity.enabled,true); assert.throws(()=>config.yamlText('bad: [',[]));
  });
  const { normalizePermissions }=require('../lib/permissions.ts');
  const profiles=require('../lib/permission-profiles.ts');
  await test('Profiles and legacy access map to explicit permissions',()=>{
    assert.equal(profiles.profilePermissions('viewer')['server.read'],true); assert.equal(profiles.profilePermissions('manager')['user.create'],undefined); assert.equal(normalizePermissions({lifecycle:true})['control.start'],true); assert.deepEqual(normalizePermissions({'control.start':'true'}),{});
  });
  class PermissionDeniedError extends Error { constructor(message,status){ super(message); this.status=status; } }
  mocks.set('./server-permissions',{PermissionDeniedError});
  mocks.set('./supabase-admin',{supabaseAdmin:()=>{throw new Error('Unexpected database use')}});
  const {validateDelegation}=require('../lib/member-access.ts');
  await test('Delegates cannot escalate privileges or change self/owner',()=>{
    const access={owner:false,userId:'manager',server:{userId:'owner'},permissions:{'user.update':true,'server.read':true}};
    assert.throws(()=>validateDelegation(access,'other',{'server.delete':true})); assert.throws(()=>validateDelegation(access,'manager',{})); assert.throws(()=>validateDelegation(access,'owner',{})); assert.deepEqual(validateDelegation(access,'other',{'server.read':true}),{'server.read':true});
  });
  const lifecycle=require('../lib/lifecycle.ts');
  await test('Lifecycle rejects simultaneous actions and network configuration conflicts',()=>{
    lifecycle.beginAction('one','start'); assert.equal(lifecycle.pendingAction('one'),'start'); assert.throws(()=>lifecycle.beginAction('one','restart')); assert.throws(()=>lifecycle.lockConfiguration(['one'])); lifecycle.endAction('one'); const unlock=lifecycle.lockConfiguration(['one']); assert.throws(()=>lifecycle.beginAction('one','start')); unlock(); lifecycle.beginAction('one','stop'); lifecycle.endAction('one');
  });
  await fsp.mkdir(fixture,{recursive:true});
  process.env.CRAFTPANEL_DATA_DIR=path.join(fixture,'state');
  const servers=[{id:'proxy',type:'Velocity',name:'Proxy',port:25565,status:'Detenido'},{id:'one',type:'Paper',name:'Lobby',version:'1.21.4',port:25566,status:'Detenido'},{id:'two',type:'Paper',name:'Old',version:'1.18.2',port:25567,status:'Detenido'}];
  const manager={getServer:async id=>servers.find(s=>s.id===id),listServers:async()=>servers,resolveServerPath:async(id,relative='')=>{
    const base=path.join(fixture,id),target=path.resolve(base,relative); if(!target.startsWith(base+path.sep)&&target!==base)throw new Error('Invalid path'); return {path:target,base};
  },readVelocityConfig:async id=>{
    let text='';try{text=await fsp.readFile(path.join(fixture,id,'velocity.toml'),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
    const doc=text?TOML.parse(text):{};return {text,servers:Object.entries(doc.servers||{}).filter(([name])=>name!=='try').map(([name,address])=>({name,address}))};
  }};
  mocks.set('./server-manager',manager);
  const {configureNetwork}=require('../lib/network-provision.ts');
  const network={...baseConfig,servers:[{name:'lobby',serverId:'one',address:'127.0.0.1:25566',priority:1},{name:'survival',serverId:'two',address:'127.0.0.1:25567',priority:2}]};
  await test('Network configures EVERY backend, old and new Paper, with one shared secret',async()=>{
    const result=await configureNetwork('proxy',network);assert.equal(result.configuredServers.length,2);
    const secret=(await fsp.readFile(path.join(fixture,'proxy','forwarding.secret'),'utf8')).trim();
    for(const id of ['one','two']){const props=await fsp.readFile(path.join(fixture,id,'server.properties'),'utf8');assert.match(props,/online-mode=false/);assert.match(props,/server-ip=127.0.0.1/)}
    assert.equal(YAML.parse(await fsp.readFile(path.join(fixture,'one','config','paper-global.yml'),'utf8')).proxies.velocity.secret,secret);
    assert.equal(YAML.parse(await fsp.readFile(path.join(fixture,'two','paper.yml'),'utf8')).settings['velocity-support'].secret,secret);
    const first=await fsp.readFile(path.join(fixture,'proxy','velocity.toml'),'utf8');await configureNetwork('proxy',network);assert.equal(await fsp.readFile(path.join(fixture,'proxy','velocity.toml'),'utf8'),first);
  });
  await test('Permission denial and active backend leave all configuration untouched',async()=>{
    const file=path.join(fixture,'proxy','velocity.toml'),before=await fsp.readFile(file,'utf8');
    await assert.rejects(configureNetwork('proxy',{...network,motd:'unauthorized'},async id=>{if(id==='two')throw new Error('Denied')}));
    servers[2].status='Online';await assert.rejects(configureNetwork('proxy',network));servers[2].status='Detenido';assert.equal(await fsp.readFile(file,'utf8'),before);
  });
  await test('Unsupported modded backend fails before altering any file',async()=>{
    servers[2].type='Fabric';const before=await fsp.readFile(path.join(fixture,'proxy','velocity.toml'),'utf8');await assert.rejects(configureNetwork('proxy',network),/FabricProxy-Lite/);servers[2].type='Paper';assert.equal(await fsp.readFile(path.join(fixture,'proxy','velocity.toml'),'utf8'),before);
  });
  await test('Removing a backend restores its pre-network configuration',async()=>{
    await configureNetwork('proxy',{...network,servers:[network.servers[0]]});await assert.rejects(fsp.access(path.join(fixture,'two','server.properties')));assert.ok(await fsp.readFile(path.join(fixture,'one','server.properties'),'utf8'));
  });
  const payments=require('../lib/payments.ts');
  await test('Payments default to simulation and only explicit live mode enables gateway',()=>{
    delete process.env.PAYMENT_MODE;assert.equal(payments.getPaymentConfig().mode,'simulation');process.env.PAYMENT_MODE='mercadopago';assert.equal(payments.getPaymentConfig().mode,'mercadopago');process.env.PAYMENT_MODE='simulation';assert.equal(payments.getPaymentConfig().enabled,false);
  });
  let user={id:'buyer',email:'buyer@example.test'},created=0,lastOrder;
  const admin={from:()=>{const query={insert(value){lastOrder={...value,id:'order'};return query},update(value){lastOrder={...lastOrder,...value};return query},eq(){return query},select(){return query},single:async()=>({data:lastOrder,error:null})};return query}};
  mocks.set('next/server',{NextResponse:{json:(value,options)=>Response.json(value,options)}});
  mocks.set('@/lib/server-auth',{currentUser:async()=>user});mocks.set('@/lib/supabase-admin',{supabaseAdmin:()=>admin});
  mocks.set('@/lib/server-manager',{createServer:async input=>{created++;return {id:'created-server',...input}}});
  const orders=require('../app/api/orders/route.ts');const plan=require('../lib/plans.ts').hostingPlans[0];
  const orderRequest=()=>new Request('http://localhost/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:plan.id,serverName:'Test',type:'Paper',version:'1.21.4',paymentMethod:'mercadopago'})});
  await test('Confirm simulated order creates server and marks order paid without gateway',async()=>{
    const response=await orders.POST(orderRequest());const body=await response.json();assert.equal(response.status,201);assert.equal(body.simulated,true);assert.equal(created,1);assert.equal(body.order.server_id,'created-server');assert.equal(body.order.payment_status,'paid');assert.equal(body.checkoutUrl,null);
  });
  await test('Unauthenticated purchase does not create a server',async()=>{
    user=null;const response=await orders.POST(orderRequest());assert.equal(response.status,401);assert.equal(created,1);
  });
  let finishStart;
  mocks.set('@/lib/server-manager',{appendPanelMessage:()=>{},startServer:()=>new Promise(resolve=>{finishStart=resolve}),stopServer:async()=>({status:'Detenido'})});
  mocks.set('@/lib/server-permissions',{requireServerPermission:async()=>({}),permissionResponse:error=>({error:error.message,status:400})});
  const lifecycleRoute=require('../app/api/servers/[id]/route.ts');
  await test('Concurrent lifecycle requests are rejected and the lock clears after completion',async()=>{
    const request=()=>new Request('http://localhost/api/servers/one',{method:'POST',body:JSON.stringify({action:'start'})});
    const context={params:Promise.resolve({id:'one'})};const first=lifecycleRoute.POST(request(),context);
    while(!finishStart)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(lifecycle.pendingAction('one'),'start');assert.equal((await lifecycleRoute.POST(request(),context)).status,400);
    finishStart({id:'one',status:'Online'});assert.equal((await first).status,200);assert.equal(lifecycle.pendingAction('one'),null);
  });
  let activeMembership=false,paidService=false;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';
  mocks.set('@supabase/ssr',{createServerClient:()=>({auth:{getUser:async()=>({data:{user:{id:'shared-user',user_metadata:{}}}})},from:table=>{const query={select:()=>query,eq:()=>query,limit:async()=>({error:null,data:(table==='server_members'?activeMembership:paidService)?[{}]:[]})};return query}})});
  mocks.set('@/lib/admin-auth',{isAdminUser:()=>false});
  mocks.set('next/server',{NextResponse:{next:()=>({kind:'next'}),redirect:url=>({kind:'redirect',url:String(url)}),json:(value,options)=>Response.json(value,options)}});
  const {middleware}=require('../middleware.ts');
  const panelRequest=pathname=>({nextUrl:new URL('http://localhost'+pathname),url:'http://localhost'+pathname,cookies:{getAll:()=>[]}});
  await test('Panel gate recognizes active shared access and denies unrelated accounts',async()=>{
    assert.equal((await middleware(panelRequest('/panel'))).kind,'redirect');activeMembership=true;assert.equal((await middleware(panelRequest('/panel'))).kind,'next');activeMembership=false;paidService=true;assert.equal((await middleware(panelRequest('/panel'))).kind,'next');paidService=false;assert.equal((await middleware(panelRequest('/panel'))).kind,'redirect');
  });
  await test('Authenticated checkout remains available without granting general panel access',async()=>{
    assert.equal((await middleware(panelRequest('/api/orders'))).kind,'next');assert.equal((await middleware(panelRequest('/panel'))).kind,'redirect');
  });
  console.log(`${passed} regression tests passed. Fixtures: ${fixture}`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
