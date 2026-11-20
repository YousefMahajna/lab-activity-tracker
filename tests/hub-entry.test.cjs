const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Entry=require('../hub-entry.js'),Policy=require('./fixtures/access-policy.js');
const cfg={platforms:[{id:'activities'}],access:[Policy.ownerRow(),{name:'Editor',email:'editor@nvidia.com',platform:'activities',level:'editor'},{name:'Manager',email:'manager@nvidia.com',platform:'activities',level:'manager'},{name:'Blocked',email:'blocked@nvidia.com',platform:'activities',level:'none'}]};
const href=email=>'https://yousefmahajna.github.io/lab-activity-tracker/#ipl-entry=1&email='+encodeURIComponent(email);
function runtime(){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const source=html.slice(html.indexOf('/* Shared, deterministic change protocol.'),html.indexOf('const activitySaving='));
 const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,document:{documentElement:{dataset:{}}},location:{href:href('editor@nvidia.com')}});vm.runInContext(source,ctx);return ctx;
}
async function adapter(entry){
 const ctx=runtime(),J=ctx.TrackerJournal;
 const record=await J.makeBaseline({data:[{id:1,title:'Test activity'}],passwords:{lab:'test-lab',admin:'test-admin'}},'baseline_test_123');
 const body=JSON.stringify({marker:J.MARKER,record,sha256:await J.hash(record)}),calls=[],storage=new Map();
 const api=new ctx.TrackerGistApi.GistApi({gistId:'8a640ad7fe31d7a2ac5637dd4de868f5',getToken:()=>'',storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{calls.push({url,options});assert.equal(options.method,'GET');return {ok:true,json:async()=>url.includes('/comments')?[{id:100,user:{login:'owner'},body,created_at:'2026-11-20T00:00:00Z'}]:{owner:{login:'owner'},files:{}}};}});
 ctx.fetch=()=>{};ctx.ActivitiesHubEntry={load:async()=>{if(entry instanceof Error)throw entry;return entry;}};
 return {ctx,api,calls,storage};
}
test('regular URLs retain legacy entry without permission lookups',async()=>{const result=await Entry.load('https://example.com/',()=>assert.fail('unexpected request'));assert.equal(result.mode,'legacy');});
test('central Viewer, Editor and Manager/Admin roles map to Activities roles',()=>{
 for(const [email,role] of [['unknown@nvidia.com','guest'],['editor@nvidia.com','lab'],['manager@nvidia.com','admin'],[Policy.OWNER,'admin']])assert.equal(Entry.fromData(email,cfg,Policy).role,role);
 assert.throws(()=>Entry.fromData('blocked@nvidia.com',cfg,Policy),/No Lab Activities access/);
 assert.throws(()=>Entry.fromData('other@example.com',cfg,Policy),/valid NVIDIA email/);
});
test('fresh permissions determine role, ignoring URL role and name',async()=>{
 const result=await Entry.load(href('unknown@nvidia.com')+'&role=admin&name=Fake',async(url,options)=>{assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({encoding:'base64',content:Buffer.from(JSON.stringify(cfg)).toString('base64')})};},async()=>Policy);
 assert.equal(result.role,'guest');assert.equal(result.name,'unknown@nvidia.com');
 await assert.rejects(()=>Entry.load(href('editor@nvidia.com'),async()=>({ok:false}),async()=>Policy),/current Process Lab permissions/);
 assert.throws(()=>Entry.parse(href('editor@nvidia.com')+'&email=other@nvidia.com'),/select your NVIDIA email/);
});
test('hub identity bypasses legacy passwords and old sessions; public reads are anonymous',async()=>{
 const {api,calls}=await adapter({mode:'hub',name:'Editor',email:'editor@nvidia.com',role:'lab',level:'editor'});
 await api.login({role:'admin',password:'test-admin',actor:'Previous Manager'});
 const result=await api.loginFromHub();assert.equal(result.user.role,'lab');assert.equal(result.user.actor,'Editor <editor@nvidia.com>');
 assert.equal((await api.request('/api/session')).user.role,'lab');assert.ok(calls.every(c=>!c.options.headers.Authorization));
});
test('viewer cannot write or enter a legacy role from a marked hub session',async()=>{
 const {api,ctx,calls}=await adapter({mode:'hub',name:'Viewer',email:'viewer@nvidia.com',role:'viewer',level:'viewer'});await api.loginFromHub();
 await assert.rejects(()=>api.write({}),/Viewer access is read-only/);
 await assert.rejects(()=>api.login({role:'admin',password:'test-admin',actor:'Viewer'}),/Return to Process Lab/);
 assert.throws(()=>ctx.TrackerJournal.authorize({},{role:'viewer'}),/read-only/);assert.ok(calls.every(c=>c.options.method==='GET'));
});
test('failed hub lookup does not recover a previous privileged session',async()=>{
 const {api}=await adapter(new Error('Permissions unavailable'));await api.login({role:'admin',password:'test-admin',actor:'Previous Manager'});
 await assert.rejects(()=>api.loginFromHub(),/Permissions unavailable/);assert.equal((await api.request('/api/session')).user,null);
});
test('regular password checks remain and disconnected writes do not reach GitHub',async()=>{
 const {api,calls}=await adapter();await assert.rejects(()=>api.login({role:'lab',password:'wrong',actor:'Direct User'}),/Incorrect password/);
 assert.equal((await api.login({role:'lab',password:'test-lab',actor:'Direct User'})).user.role,'lab');
 await assert.rejects(()=>api.call('POST','/comments',{body:'test'}),/Connect saving/);assert.ok(calls.every(c=>c.options.method==='GET'));
});

const Hub=Entry,url=href,data=()=>structuredClone(cfg);

test('an exhausted anonymous API quota reads the same public main-branch file', async () => {
  const calls=[];
  const result=await Hub.load(url('unknown@nvidia.com')+'&role=admin',async(href,options)=>{
    calls.push({href,options});
    if(calls.length===1)return {ok:false,status:403,headers:{get:()=> '0'}};
    assert.ok(href.startsWith('https://raw.githubusercontent.com/YousefMahajna/interconnect-process-lab/main/platforms.json?_='));
    assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>data()};
  },async()=>Policy);
  assert.equal(result.role,'guest');assert.equal(calls.length,2);
});

test('rate-limit fallback still blocks denied users and unavailable sources', async () => {
  for(const denied of [false,true]){
    let calls=0;
    await assert.rejects(Hub.load(url('blocked@nvidia.com'),async()=>{
      if(++calls===1)return {ok:false,status:403,headers:{get:()=> '0'}};
      const d=data();d.access.push({name:'Blocked',email:'blocked@nvidia.com',platform:'activities',level:'none'});
      return {ok:denied,json:async()=>d};
    },async()=>Policy),e=>e.code===(denied?'NO_ACCESS':'UNAVAILABLE'));
  }
  let calls=0;
  await assert.rejects(Hub.load(url('unknown@nvidia.com'),async()=>{calls++;return {ok:false,status:403,headers:{get:()=> '1'}};},async()=>Policy),/current Process Lab permissions/);
  assert.equal(calls,1);
});

test('Activities Viewer can add only unassigned, unscheduled activities',()=>{const ctx=runtime(),J=ctx.TrackerJournal,user={role:'guest',actor:'Viewer <viewer@nvidia.com>'};const task={id:2,title:'New request',owner:'',days:{},updates:[],completedAt:null};const request={owner:user,changes:[{type:'task.add',task}]};assert.doesNotThrow(()=>J.authorize(request,user));for(const fields of [{owner:'Amir'},{days:{'2026-11-22':1}},{completedAt:123},{updates:[{id:'test'}]}])assert.throws(()=>J.authorize({owner:user,changes:[{type:'task.add',task:{...task,...fields}}]},user),/unassigned/);for(const type of ['task.edit','task.delete','note.add'])assert.throws(()=>J.authorize({owner:user,changes:[{type,taskId:1}]},user),/add new activities only/);});
