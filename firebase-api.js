(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./model.js'):null,typeof module==='object'&&module.exports?require('./journal.js'):null,typeof module==='object'&&module.exports?require('./firebase-codec.js'):null);if(typeof module==='object'&&module.exports)module.exports=api;else root.ActivitiesFirebaseApi=api;})(globalThis,function(model,journal,codec){
 'use strict';
 function create(o){
  const M=o.model||model||globalThis.TrackerModel,J=o.journal||journal||globalThis.TrackerJournal,C=o.codec||codec||globalThis.ActivitiesFirebaseCodec;
  const fetcher=o.fetch||globalThis.fetch.bind(globalThis),base=o.databaseURL.replace(/\/+$/,'')+'/activitiesJournalV1';
  let last=null,busy=null,activeUser=null,hubMode=false,hubEntry=null;
  const error=(m,s=503)=>Object.assign(Error(m),{status:s});
  async function call(method,path='',value,etag){
   const token=await o.auth.getIdToken();if(!token)throw error('Sign in with your verified NVIDIA email.',401);
   const headers={'X-Firebase-ETag':'true',...(value===undefined?{}:{'Content-Type':'application/json'}),...(etag?{'if-match':etag}:{})};
   let r;try{r=await fetcher(base+path+'.json?auth='+encodeURIComponent(token),{method,headers,...value===undefined?{}:{body:JSON.stringify(value)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});}catch{throw error(method==='GET'?'The shared Activities database could not be reached.':'The save could not be confirmed. Pending work is retained for a safe retry.');}
   if(!r.ok)throw error(r.status===412?'This operation already exists; checking the confirmed result.':r.status===401||r.status===403?'Activities access was refused. Verify your email and complete the Firebase rules setup.':'Firebase returned HTTP '+r.status+'.',r.status);
   return {value:await r.json(),etag:r.headers.get('ETag')};
  }
  async function ensure(){await o.auth.ready();if(!o.auth.user()?.emailVerified){await o.signIn();await o.auth.refresh();}const u=o.auth.user();if(!u?.emailVerified)throw error('Verify your NVIDIA email before entering Activities.',401);await o.access.load();const role=o.access.role(u.email);if(!role)throw error('No Activities access is listed for '+u.email+'.',403);return {u,role};}
  function stillAllowed(){const u=o.auth.user();return u?.emailVerified&&activeUser?.uid===u.uid&&({guest:1,lab:2,admin:3}[activeUser.role]||9)<=({guest:1,lab:2,admin:3}[o.access.role(u.email)]||0);}
  async function readAll(){
   const raw=(await call('GET')).value;if(!raw||raw.schema!==1||!raw.initialized)throw error('Activities Firebase setup is not initialized. Open Shared setup; the GitHub source is unchanged.',428);
   await o.access.load();if(activeUser&&!stillAllowed()){activeUser=null;throw error('Your Activities permission changed. Sign in again.',401);}
   const baseline={instance:raw.instance,state:JSON.parse(raw.stateJSON),sourceSavedAt:raw.sourceSavedAt,passwords:{}};J.validateState(baseline.state);
   const rows=Object.entries(raw.entries||{}).map(([key,row])=>({key,...row})).sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key)),records=[];
   const issues=[];
   for(let i=0;i<rows.length;i++){const row=rows[i];try{const request=C.decode(row.request);J.validateRequest(request);if(request.id!==row.key||request.instance!==raw.instance||row.role!==request.owner.role||row.actor!==request.owner.actor)throw Error('Operation identity does not match its record.');J.authorize(request,{role:row.role,actor:row.actor});records.push({record:{kind:'change',request,parents:Object.keys(row.parents||{})},sequence:raw.maxSequence+i+1,at:new Date(row.at).toISOString()});}catch(e){issues.push({operationId:row.key,error:e.message});}}
   const result=await J.reduce(baseline,records),history=JSON.parse(raw.historyJSON||'[]'),legacyConflicts=JSON.parse(raw.conflictsJSON||'[]').filter(c=>!result.resolved.has(c.operationId));
   for(const c of legacyConflicts)result.conflicts.set(c.operationId,c);
   result.state.revision+=raw.initialRevision-1;result.state.storageKind='firebase-journal';result.state.folderConflicts=[...result.conflicts.values()];result.state.folderIssues.push(...issues);result.state.readOnly=false;
   result.applied=new Set(result.history.map(h=>h.op_id));result.history=history.concat(result.history);result.baseline=baseline;result.legacyHashes=JSON.parse(raw.operationHashesJSON||'{}');result.source=raw;last=result;return result;
  }
  async function read(){if(busy)return busy;busy=readAll();try{return await busy;}finally{busy=null;}}
  async function login({role,actor}){const {u,role:maxRole}=await ensure();if(!['guest','lab','admin'].includes(role)||({guest:1,lab:2,admin:3}[role]>({guest:1,lab:2,admin:3}[maxRole])))throw error('Your verified account does not have this access level.',403);if(typeof actor!=='string'||actor.trim().length<2||actor.trim().length>100)throw error('Enter your name.',401);activeUser={role,actor:actor.trim(),email:u.email.toLowerCase(),uid:u.uid};await read();o.storage?.setItem('activities-firebase-session-v1',JSON.stringify(activeUser));return {user:activeUser};}
  async function loginFromHub(){hubMode=true;const entry=await o.loadHub();const {u}=await ensure();if(u.email.toLowerCase()!==entry.email.toLowerCase())throw error('You are signed in as '+u.email+'. Return to Process Lab with this email or sign out to switch accounts.',401);const level=o.access.level(u.email),role=o.access.role(u.email);hubEntry={...entry,role,level,name:o.access.name(u.email)};await login({role,actor:hubEntry.name+' <'+entry.email+'>'});return {user:activeUser,entry:hubEntry};}
  async function write(request){
   const before=await read();if(!stillAllowed())throw error('Sign in again; pending work is retained.',401);if(before.state.readOnly)throw error('A journal integrity issue needs owner review.',409);J.validateRequest(request);J.authorize(request,activeUser);if(request.instance!==before.baseline.instance)throw error('Pending work belongs to another tracker. Export it before switching.',409);
   if(before.legacyHashes[request.id]){if(before.legacyHashes[request.id]!==await J.hash(request))throw error('A confirmed operation ID has different content.',409);if(before.conflicts.has(request.id))throw Object.assign(error('The original change needs conflict review.',409),{details:before.conflicts.get(request.id)});return {ok:true,replayed:true,revision:before.state.revision};}
   if(request.changes.some(c=>c.type==='auth.edit'))throw error('Shared role passwords have been replaced by verified NVIDIA accounts. This old password change is retained; review it in Pending / drafts.',409);
   const previous=before.groups.get(request.id);if(previous){if(!M.equal(previous.request,request))throw error('Operation ID belongs to different work.',409);if(before.conflicts.has(request.id))throw Object.assign(error('This saved change needs conflict review.',409),{details:before.conflicts.get(request.id)});return {ok:true,replayed:true,revision:before.state.revision};}
   for(const id of request.resolves||[]){const conflict=before.conflicts.get(id);if(!conflict)throw error('Refresh the conflict before resolving it.',409);if(activeUser.role!=='admin'&&conflict.owner.actor!==activeUser.actor)throw error('Only its author or manager may resolve a conflict.',403);}
   const row={request:C.encode(request),parents:Object.fromEntries(before.heads.map(id=>[id,true])),uid:activeUser.uid,email:activeUser.email,role:activeUser.role,actor:activeUser.actor,at:{'.sv':'timestamp'}};
   try{await call('PUT','/entries/'+request.id,row,'null_etag');}catch(e){if(e.status!==412)throw e;}
   const after=await read(),confirmed=after.groups.get(request.id);if(!confirmed||!after.applied.has(request.id)||!M.equal(confirmed.request,request))throw error('Save confirmation is not yet available. The same operation is retained for retry.');
   if(after.conflicts.has(request.id))throw Object.assign(error('Both versions are retained. Review the conflict.',409),{details:after.conflicts.get(request.id)});return {ok:true,operationId:request.id,revision:after.state.revision};
  }
  async function initialize(source){
   await ensure();if(o.auth.user().email.toLowerCase()!=='ymahajna@nvidia.com')throw error('Only the verified owner can initialize Activities.',403);
   if(source.state.readOnly||source.state.folderIssues?.length)throw error('The original journal has integrity warnings. Resolve them before migration.',409);
   const hashes={};for(const [id,g]of source.groups)hashes[id]=await J.hash(g.request);
   const conflicts=[...source.conflicts.values()];if(conflicts.some(c=>c.changes.some(x=>x.type==='auth.edit')))throw error('Resolve the legacy role-password conflict before migration.',409);
   const history=M.clone(source.history).map(h=>({...h,changes:h.changes.map(c=>c.type==='auth.edit'?{type:'legacy.auth.redacted',redacted:true}:c)}));
   const data={schema:1,initialized:true,instance:source.state.instance,initialRevision:source.state.revision,maxSequence:Math.max(0,...history.map(h=>h.seq)),sourceSavedAt:source.state.savedAt||'',stateJSON:JSON.stringify(source.state),historyJSON:JSON.stringify(history),conflictsJSON:JSON.stringify(conflicts),operationHashesJSON:JSON.stringify(hashes),sourceHash:await J.hash({state:source.state,hashes}),sourceGist:'8a640ad7fe31d7a2ac5637dd4de868f5',migratedAt:new Date().toISOString()};
   await call('PUT','',data,'null_etag');const check=await read();if(!M.equal(check.state.data,source.state.data)||!M.equal(check.state.emailRecipients,source.state.emailRecipients)||check.state.revision!==source.state.revision)throw error('Migration verification needs owner review. Do not repeat initialization.',409);return check;
  }
  async function request(url,payload){
   if(url==='/api/login')return login(payload);if(url==='/api/logout'){activeUser=null;o.storage?.removeItem('activities-firebase-session-v1');await o.auth.signOut();return {ok:true};}
   if(url==='/api/session'){await o.auth.ready();const u=o.auth.user();if(!u?.emailVerified)return {user:null,allowGuest:true,protocol:5};await o.access.load();let saved;try{saved=JSON.parse(o.storage?.getItem('activities-firebase-session-v1')||'null');}catch{}if(saved&&saved.uid===u.uid)activeUser=saved;return {user:stillAllowed()?activeUser:null,allowGuest:true,protocol:5};}
   if(!activeUser)throw error('Sign in with your verified NVIDIA email.',401);const result=await read();
   if(url==='/api/state')return M.clone(result.state);if(url==='/api/operations')return write(payload);if(activeUser.role!=='admin')throw error('Manager permission required.',403);
   if(url==='/api/backup')return {...M.clone(result.state),journalBackup:{baseline:result.baseline,history:result.history,operationHashes:result.legacyHashes}};
   if(url.startsWith('/api/history/')){const row=result.history.find(h=>h.seq===Number(url.split('/').pop()));if(!row)throw error('History entry not found.',404);return M.clone(row);}
   if(url.startsWith('/api/history')){const before=new URL(url,'https://tracker.invalid').searchParams.get('before');return M.clone([...result.history].sort((a,b)=>b.seq-a.seq).filter(h=>!before||h.seq<Number(before)).slice(0,100));}throw error('Unknown Activities action.',404);
  }
  return {request,read,initialize,loginFromHub,get last(){return last;},get user(){return activeUser;},get connected(){return stillAllowed()&&!!last;},getToken:()=>null};
 }
 const api={create};return api;
});
