(function(){
 'use strict';function mount(){
  const card=document.querySelector('.login-card'),signin=document.createElement('button'),setup=document.createElement('a'),note=document.createElement('p');
  signin.id='firebase-account';signin.className='btn-cancel';signin.type='button';signin.textContent='NVIDIA email sign-in / switch account';signin.style.marginTop='16px';
  signin.onclick=async()=>{try{await LabFirebaseAuth.ready();if(LabFirebaseAuth.user()?.emailVerified){if(!confirm('Sign out of the current verified account to switch users? Pending work stays in this browser.'))return;await LabFirebaseAuth.signOut();}await LabFirebaseSignIn.open();note.textContent=LabFirebaseAuth.user()?.emailVerified?'Verified. Choose your Activities role above.':'Verify your NVIDIA email before entering.';}catch(e){note.textContent=e.message;}};
  setup.id='activities-shared-setup';setup.href='shared-setup.html';setup.textContent='Shared setup (owner)';setup.style.cssText='display:block;margin-top:14px;color:#0658bb';
  note.id='firebase-account-status';note.style.cssText='font-size:12px;line-height:1.6;margin-top:12px';note.textContent='Use your verified NVIDIA email account. Activities no longer uses a shared role password.';card.append(signin,setup,note);
  const header=document.querySelector('.header-left'),status=document.createElement('span');status.id='firebase-saving-state';status.style.cssText='font-size:11px;color:var(--text-3)';header.append(status);
  LabFirebaseAuth.onChange(u=>{status.textContent=u?.emailVerified?u.email+' · Firebase shared saving':'Verified sign-in required';});
  // Existing recovery records and the operation queue are never cleared here.
  const recovery=document.createElement('button');recovery.className='btn-cancel';recovery.type='button';recovery.style.marginTop='12px';recovery.textContent='Download browser recovery';
  recovery.onclick=()=>{const records={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^(labtracker-v3:|labtracker_data_v1|labtracker-last-actor-v5)/.test(k))records[k]=localStorage.getItem(k);}const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='activities-browser-recovery-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};card.append(recovery);
  LabFirebaseAuth.ready().then(()=>{const u=LabFirebaseAuth.user();status.textContent=u?.emailVerified?u.email+' · Firebase shared saving':'Verified sign-in required';}).catch(e=>{note.textContent=e.message;});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
