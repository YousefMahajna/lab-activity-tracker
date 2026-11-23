/* Authorization/validation predicates; Firebase Console validates the provider rule syntax. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const rules=require('../firebase-database-rules.json').rules,C=require('../firebase-codec.js');
const fixed={schema:1,initialized:true,instance:'baseline_test_123',initialRevision:1,maxSequence:10,sourceSavedAt:'2026',stateJSON:'{}',historyJSON:'[]',conflictsJSON:'[]',operationHashesJSON:'{}',sourceHash:'hash',sourceGist:'8a640ad7fe31d7a2ac5637dd4de868f5',migratedAt:'2026'};
const rank={viewer:'guest',editor:'lab',manager:'admin',admin:'admin'};
function check(level,change,{email='person@nvidia.com',verified=true,role=rank[level],anonymous=false,tamper}={}){
 const auth=anonymous?{uid:'user',token:{firebase:{sign_in_provider:'anonymous'}}}:email?{uid:'user',token:{email,email_verified:verified,firebase:{sign_in_provider:'password'}}}:null,request={id:'op_test_1234567890',instance:fixed.instance,owner:{role,actor:'Person'},changes:[change]},row={request:C.encode(request),uid:'user',email:anonymous?'':email,role,actor:'Person',at:1000};if(tamper)tamper(row);
 const original={activitiesAccessV1:{defaultLevel:'viewer',users:{[email?.replaceAll('.',',')]:{level}}},activitiesJournalV1:fixed};
 const updated=structuredClone(original);updated.activitiesJournalV1.entries={[request.id]:row};
 const snap=(tree,path=[])=>{const value=()=>path.reduce((v,k)=>v?.[k],tree);return {val:()=>value()??null,exists:()=>value()!=null,child:p=>snap(tree,path.concat(p.split('/'))),parent:()=>snap(tree,path.slice(0,-1)),isString:()=>typeof value()==='string',isNumber:()=>typeof value()==='number',hasChild:p=>snap(tree,path.concat(p.split('/'))).exists(),hasChildren:keys=>keys?keys.every(k=>snap(tree,path.concat(k.split('/'))).exists()):value()&&typeof value()==='object'&&Object.keys(value()).length>0};};
 function expr(text,path,vars={}){const context=vm.createContext({auth,root:snap(original),data:snap(original,path),newData:snap(updated,path),now:1000,...vars});vm.runInContext('String.prototype.matches=function(r){return r.test(this)};String.prototype.beginsWith=function(s){return this.startsWith(s)};',context);return !!vm.runInContext(text,context);}
 const rootPath=['activitiesJournalV1'],entryPath=rootPath.concat('entries',request.id),entryRules=rules.activitiesJournalV1.entries.$operation;
 if(!expr(entryRules['.write'],entryPath,{$operation:request.id}))return false;
 if(!expr(rules.activitiesJournalV1['.validate'],rootPath))return false;
 function walk(node,path,vars){if(node['.validate']&&!expr(node['.validate'],path,vars))return false;const value=snap(updated,path).val();if(value&&typeof value==='object')for(const k of Object.keys(value)){let next=node[k],v=vars;if(!next){const wild=Object.keys(node).find(x=>x.startsWith('$'));if(!wild)continue;next=node[wild];v={...vars,[wild]:k};}if(!walk(next,path.concat(k),v))return false;}return true;}
 return walk(entryRules,entryPath,{$operation:request.id});
}
const task={id:2,title:'New',details:[],owner:'',days:{},updates:[],completedAt:null};
test('anonymous Viewer/Lab may add; only Lab may edit, and neither can escalate to owner',()=>{
 const name={anonymous:true};
 assert.equal(check('viewer',{type:'task.add',task},name),true);
 const edit=field=>({type:'task.edit',taskId:1,fields:{[field]:{before:'',after:'Changed'}}});
 assert.equal(check('editor',edit('title'),name),true);assert.equal(check('viewer',edit('title'),name),false);
 for(const field of ['owner','days','priority'])assert.equal(check('editor',edit(field),name),false);
 assert.equal(check('editor',{type:'task.delete',taskId:1,before:task},name),false);
 assert.equal(check('editor',{type:'settings.edit',before:[],after:[]},name),false);
 assert.equal(check('editor',{type:'task.add',task},{anonymous:true,role:'admin'}),false);
 assert.equal(check('editor',{type:'task.add',task},{anonymous:true,tamper:r=>r.uid='another-user'}),false);
 assert.equal(check('viewer',{type:'task.add',task},{email:null}),false);
 assert.equal(check('manager',{type:'task.add',task}),false,'a manager label does not grant owner access');
});
test('verified Viewer may add an unassigned task; forged higher roles and assignments fail',()=>{assert.equal(check('viewer',{type:'task.add',task}),true);assert.equal(check('viewer',{type:'task.add',task:{...task,owner:'Amir'}}),false);assert.equal(check('viewer',{type:'task.add',task:{...task,days:{Mon:'work'}}}),false);assert.equal(check('viewer',{type:'task.add',task},{role:'admin'}),false);assert.equal(check('viewer',{type:'task.add',task},{verified:false}),false);assert.equal(check('viewer',{type:'task.add',task},{email:'outside@example.com'}),false);});
test('protected native task fields override any conflicting opaque values',()=>{const encoded=C.encode({id:'op_1234567890',instance:fixed.instance,owner:{role:'guest',actor:'Person'},changes:[{type:'task.add',task}]});encoded.changes.c0000.task.dataJSON=JSON.stringify({...task,owner:'Amir',days:{Mon:'work'},completedAt:999,updates:[{t:'Injected'}]});const decoded=C.decode(encoded);assert.equal(decoded.changes[0].task.owner,'');assert.deepEqual(decoded.changes[0].task.days,{});assert.equal(decoded.changes[0].task.completedAt,null);assert.deepEqual(decoded.changes[0].task.updates,[]);});
test('editor can edit permitted fields but assignment, scheduling and deletion require manager',()=>{const edit=field=>({type:'task.edit',taskId:1,fields:{[field]:{before:'',after:'Changed'}}});assert.equal(check('editor',edit('title')),true);for(const field of ['owner','days','priority']){assert.equal(check('editor',edit(field)),false);assert.equal(check('manager',edit(field),{email:'ymahajna@nvidia.com'}),true);}assert.equal(check('editor',{type:'task.delete',taskId:1,before:task}),false);assert.equal(check('manager',{type:'task.delete',taskId:1,before:task},{email:'ymahajna@nvidia.com'}),true);});
test('new Activities path has no public ancestor read/write and other app access is explicit',()=>{assert.equal(rules['.read'],false);assert.equal(rules['.write'],false);for(const p of ['appState','processRecipeLibrary','adhesivesSharedV1','adhesiveAccessV1'])assert.equal(rules[p]['.read'],true);assert.equal(check('none',{type:'task.add',task},{role:'guest'}),false);});
