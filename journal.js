(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./model.js'):root.TrackerModel);if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerJournal=api;})(globalThis,function(M){
 'use strict';
 const MARKER='lab-activity-journal-v1';
 const clone=M.clone;
 const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(x);
 async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(M.canonical(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
 function error(message,status=400){return Object.assign(new Error(message),{status});}
 function note(n){if(!n||!validId(n.id)||typeof n.d!=='string'||typeof n.t!=='string'||n.t.length>20000||(n.lines&&(!Array.isArray(n.lines)||n.lines.some(l=>typeof l!=='string'||l.length>20000))))throw error('Invalid note.');}
 function task(t){if(!t||!Number.isSafeInteger(t.id)||t.id<0||typeof t.title!=='string'||!t.title.trim()||t.title.length>1000||!Array.isArray(t.details)||t.details.some(l=>typeof l!=='string')||!t.days||Array.isArray(t.days)||!Array.isArray(t.updates))throw error('Invalid activity.');const seen=new Set();for(const n of t.updates){note(n);if(seen.has(n.id))throw error('Duplicate note ID.');seen.add(n.id);}}
 function validateState(s){if(!s||!Array.isArray(s.data)||!Array.isArray(s.emailRecipients))throw error('Invalid dataset.');const seen=new Set();for(const t of s.data){task(t);if(seen.has(t.id))throw error('Duplicate activity ID.');seen.add(t.id);}}
 function validateRequest(r){
  if(!r||!validId(r.id)||!validId(r.instance)||!r.owner||!['guest','lab','admin'].includes(r.owner.role)||typeof r.owner.actor!=='string'||r.owner.actor.length<2||r.owner.actor.length>100||!Array.isArray(r.changes)||r.changes.length>1000||(!r.changes.length&&!r.resolves?.length)||(r.resolves||[]).some(x=>!validId(x)))throw error('Invalid change request.');
  for(const c of r.changes){
   if(c.type==='auth.edit'){if(!c.before||!c.after||['lab','admin'].some(k=>typeof c.before[k]!=='string'||typeof c.after[k]!=='string'||!c.after[k].trim()))throw error('Both role passwords are required.');}
   else if(c.type==='task.add')task(c.task);
   else if(c.type==='task.edit'){if(!Number.isSafeInteger(c.taskId)||!c.fields||!Object.keys(c.fields).length||Object.entries(c.fields).some(([k,v])=>!M.fields.includes(k)||!v||!Object.hasOwn(v,'before')||!Object.hasOwn(v,'after')))throw error('Invalid activity edit.');}
   else if(c.type==='task.delete')task(c.before);
   else if(c.type==='note.add')note(c.note);
   else if(c.type==='note.edit'){note(c.before);note(c.after);if(c.noteId!==c.before.id||c.noteId!==c.after.id)throw error('Invalid note edit.');}
   else if(c.type==='note.delete')note(c.before);
   else if(c.type==='settings.edit'){if(!Array.isArray(c.before)||!Array.isArray(c.after)||c.after.some(x=>typeof x!=='string'))throw error('Invalid settings.');}
   else throw error('Unknown change type.');
   if(!['settings.edit','auth.edit','task.add'].includes(c.type)&&(!Number.isSafeInteger(c.taskId)||c.taskId<0))throw error('Invalid activity ID.');
  }
 }
 function authorize(r,user){
  if(user?.role==='viewer')throw error('Viewer access is read-only.',403);
  if(!user||r.owner.actor!==user.actor||r.owner.role!==user.role)throw error('Sign in with the original name and role for this pending change.',403);
  for(const c of r.changes){if(user.role==='admin')continue;if(user.role==='guest'&&c.type!=='task.add')throw error('Guest users may add new activities only.',403);if(['settings.edit','auth.edit','task.delete'].includes(c.type))throw error('Manager permission required.',403);if(c.type==='task.edit'&&Object.keys(c.fields).some(k=>!['title','details','sub','req','completedAt'].includes(k)))throw error('Manager permission required for this field.',403);if(c.type==='task.add'&&(c.task.owner||Object.keys(c.task.days).length||c.task.completedAt||(user.role==='guest'&&c.task.updates.length)))throw error('New activities must be unassigned.',403);}
 }
 function partial(state,changes){const ids=new Set(changes.map(c=>c.taskId??c.task?.id));return {data:clone(state.data.filter(t=>ids.has(t.id))),emailRecipients:clone(state.emailRecipients)};}
 async function reduce(baseline,records){
  validateState(baseline.state);
  const groups=new Map(),issues=[];
  for(const entry of records){
   const r=entry.record;try{validateRequest(r.request);if(r.request.instance!==baseline.instance)continue;if(!Array.isArray(r.parents)||r.parents.some(p=>!validId(p)||p===r.request.id))throw error('Invalid change dependencies.');
    const old=groups.get(r.request.id);if(old){if(!M.equal(old.request,r.request)){old.ambiguous=true;issues.push({operationId:r.request.id,error:'Different contents share an operation ID; all versions retained.'});}else{for(const p of r.parents)old.parents.add(p);old.sequence=Math.min(old.sequence,entry.sequence);}}
    else groups.set(r.request.id,{request:r.request,parents:new Set(r.parents),sequence:entry.sequence,at:entry.at});
   }catch(e){issues.push({commentId:entry.sequence,error:e.message});}
  }
  let state=clone(baseline.state),passwords=clone(baseline.passwords||{});const remaining=new Map(groups),applied=new Set(),heads=new Set(groups.keys()),conflicts=new Map(),resolved=new Set(),history=[];
  while(remaining.size){
   const ready=[...remaining].filter(([,g])=>!g.ambiguous&&[...g.parents].every(p=>applied.has(p))).sort((a,b)=>a[1].sequence-b[1].sequence||a[0].localeCompare(b[0]));
   if(!ready.length){for(const [id] of remaining)issues.push({operationId:id,error:'A journal dependency is missing or damaged.'});break;}
   const [id,g]=ready[0];remaining.delete(id);const before=partial(state,g.request.changes);let conflict=null;
   try{let nextPasswords=clone(passwords);for(const c of g.request.changes.filter(c=>c.type==='auth.edit')){if(!M.equal(passwords,c.before)&&!M.equal(passwords,c.after))throw error('Role settings changed on another PC. Review before replacing them.',409);nextPasswords=clone(c.after);}const next=M.apply(state,g.request.changes);validateState(next);state=next;passwords=nextPasswords;for(const target of g.request.resolves||[])resolved.add(target);}
   catch(e){conflict=e;conflicts.set(id,{operationId:id,owner:g.request.owner,changes:g.request.changes,error:e.message});}
   applied.add(id);for(const p of g.parents)heads.delete(p);
   history.push({seq:g.sequence,op_id:id,at:g.at,role:g.request.owner.role,actor:g.request.owner.actor,changes:g.request.changes,before,after:partial(state,g.request.changes),status:conflict?'conflict':'applied'});
  }
  for(const id of resolved)conflicts.delete(id);
  return {state:{...state,instance:baseline.instance,initialized:true,revision:applied.size+1,savedAt:history.at(-1)?.at||baseline.sourceSavedAt,version:5,folderMode:true,storageKind:'gist-journal',folderConflicts:[...conflicts.values()],folderIssues:issues},passwords,groups,heads:[...heads].filter(x=>applied.has(x)).sort(),conflicts,resolved,history};
 }
 async function makeBaseline(input,instance){
  const state={data:[],emailRecipients:input.emailRecipients||[]};const used=new Set();
  for(const raw of input.data||[]){if(used.has(raw.id))throw error('Duplicate activity ID in source.');used.add(raw.id);const t={...clone(raw),id:raw.id,title:raw.title,p:raw.p??'–',priority:raw.priority||'',owner:raw.owner||'',req:raw.req||'',details:raw.details||(raw.sub?[raw.sub]:[]),sub:raw.sub||'',days:raw.days||{},completedAt:raw.completedAt??null,updates:[]};let i=0;for(const n of raw.updates||[])t.updates.push({...clone(n),id:'n_'+(await hash({instance,task:raw.id,index:i++,note:n})).slice(0,32),d:n.d||'',t:n.t||n.lines?.[0]||''});state.data.push(t);}
  validateState(state);return {marker:MARKER,kind:'baseline',instance,state,sourceSavedAt:input.savedAt||null,createdAt:new Date().toISOString(),passwords:clone(input.passwords||{}),sourceHash:await hash({data:input.data,emailRecipients:input.emailRecipients||[],passwords:input.passwords||{}})};
 }
 return {MARKER,hash,error,validateState,validateRequest,authorize,reduce,makeBaseline};
});
