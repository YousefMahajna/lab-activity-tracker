(function(){
 'use strict';const $=id=>document.getElementById(id),status=$('status');let preview=null;
 const api=ActivitiesFirebaseApi.create({databaseURL:LabFirebaseConfig.databaseURL,auth:LabFirebaseAuth,access:ActivitiesFirebaseAccess,signIn:LabFirebaseSignIn.open});
 function identity(){const u=LabFirebaseAuth.user();$('identity').textContent=u?u.email+(u.emailVerified?' · verified':' · verify email'):'Not signed in';}
 function owner(){const u=LabFirebaseAuth.user();if(!u?.emailVerified||u.email.toLowerCase()!=='ymahajna@nvidia.com')throw Error('Sign in with the verified owner account first.');}
 function controls(){ $('initialize').disabled=!preview||!$('rulesReady').checked||!$('oldTabsClosed').checked;}
 async function permissions(){const r=await fetch('https://raw.githubusercontent.com/YousefMahajna/interconnect-process-lab/main/platforms.json?_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('The latest Users list could not be read.');const d=await r.json();await ActivitiesFirebaseAccess.sync(LabAccess.validate(d.access,d.platforms.map(p=>p.id)));}
 async function run(fn){const buttons=[...document.querySelectorAll('main button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);identity();controls();}}
 $('rulesReady').onchange=controls;$('oldTabsClosed').onchange=controls;
 $('copyRules').onclick=()=>run(async()=>{await navigator.clipboard.writeText($('rules').value);status.textContent='Copied. Publish these rules in Firebase, then return here.';});
 $('signin').onclick=()=>run(async()=>{await LabFirebaseAuth.ready();await LabFirebaseSignIn.open();identity();status.textContent=LabFirebaseAuth.user()?.emailVerified?'Verified account ready.':'Verify your email before continuing.';});
 $('preview').onclick=()=>run(async()=>{owner();preview=await ActivitiesSource.read($('sourceToken').value.trim());$('previewInfo').textContent=preview.state.data.length+' activities · '+preview.state.data.reduce((n,t)=>n+t.updates.length,0)+' notes · revision '+preview.state.revision+' · '+preview.history.length+' history records · '+preview.conflicts.size+' retained conflicts';status.textContent='Preview ready. No source or Firebase activity data changed.';});
 $('initialize').onclick=()=>run(async()=>{
  owner();if(!$('rulesReady').checked||!$('oldTabsClosed').checked)throw Error('Publish the rules and close old Activities tabs first.');
  status.textContent='Reading the latest journal and verifying every record…';const source=await ActivitiesSource.read($('sourceToken').value.trim());await permissions();
  const result=await api.initialize(source);$('sourceToken').value='';status.textContent='Initialized and verified: '+result.state.data.length+' activities, revision '+result.state.revision+'. Open Activities in the original browser and sign in. Reload old bookmarks/tabs to use Firebase. The GitHub journal was not changed.';
 });
 $('sync').onclick=()=>run(async()=>{owner();if(!$('rulesReady').checked)throw Error('Publish the updated rules first.');await permissions();status.textContent='Activities permissions match the saved Users list.';});
 addEventListener('pagehide',()=>{$('sourceToken').value='';});
 Promise.all([LabFirebaseAuth.ready(),fetch('firebase-database-rules.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Rules file unavailable.');return r.text();}).then(t=>{$('rules').value=t;})]).then(()=>{identity();status.textContent='Ready. Follow steps 1–3.';}).catch(e=>{status.textContent=e.message;});
})();
