/* Native rule-visible operation types; JSON preserves empty arrays, nulls and original field values. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 function json(v){const text=JSON.stringify(v);if(typeof text!=='string')throw Error('Unsupported change value.');return text;}
 function task(t){const other=clone(t);for(const k of ['owner','days','completedAt','updates'])delete other[k];return {dataJSON:json(other),owner:t.owner||'',daysJSON:json(t.days),completedAtJSON:json(t.completedAt??null),updatesJSON:json(t.updates)};}
 function readTask(t){return {...JSON.parse(t.dataJSON),owner:t.owner,days:JSON.parse(t.daysJSON),completedAt:JSON.parse(t.completedAtJSON),updates:JSON.parse(t.updatesJSON)};}
 function change(c){
  const out={type:c.type};if(c.taskId!==undefined)out.taskId=c.taskId;
  if(c.type==='task.add')out.task=task(c.task);
  else if(c.type==='task.edit'){out.fields={};for(const [k,v]of Object.entries(c.fields))out.fields[k]={beforeJSON:json(v.before),afterJSON:json(v.after)};}
  else if(c.type==='task.delete')out.beforeJSON=json(c.before);
  else if(c.type==='note.add')out.noteJSON=json(c.note);
  else if(['note.edit','note.delete'].includes(c.type)){out.noteId=c.noteId;out.beforeJSON=json(c.before);if(c.after!==undefined)out.afterJSON=json(c.after);}
  else if(c.type==='settings.edit'){out.beforeJSON=json(c.before);out.afterJSON=json(c.after);}
  else throw Error('Legacy role-password changes are no longer supported. Your pending work is retained for review.');
  return out;
 }
 function readChange(c){
  const out={type:c.type};if(c.taskId!==undefined)out.taskId=c.taskId;
  if(c.type==='task.add')out.task=readTask(c.task);
  else if(c.type==='task.edit'){out.fields={};for(const [k,v]of Object.entries(c.fields))out.fields[k]={before:JSON.parse(v.beforeJSON),after:JSON.parse(v.afterJSON)};}
  else if(c.type==='task.delete')out.before=JSON.parse(c.beforeJSON);
  else if(c.type==='note.add')out.note=JSON.parse(c.noteJSON);
  else if(['note.edit','note.delete'].includes(c.type)){out.noteId=c.noteId;out.before=JSON.parse(c.beforeJSON);if(c.afterJSON!==undefined)out.after=JSON.parse(c.afterJSON);}
  else if(c.type==='settings.edit'){out.before=JSON.parse(c.beforeJSON);out.after=JSON.parse(c.afterJSON);}
  else throw Error('Unsupported operation type.');return out;
 }
 function encode(r){return {id:r.id,instance:r.instance,owner:clone(r.owner),changes:Object.fromEntries(r.changes.map((c,i)=>['c'+String(i).padStart(4,'0'),change(c)])),resolves:Object.fromEntries((r.resolves||[]).map(id=>[id,true]))};}
 function decode(r){return {id:r.id,instance:r.instance,owner:clone(r.owner),changes:Object.keys(r.changes||{}).sort().map(k=>readChange(r.changes[k])),...Object.keys(r.resolves||{}).length?{resolves:Object.keys(r.resolves)}:{}};}
 const api={encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActivitiesFirebaseCodec=api;
})(globalThis);
