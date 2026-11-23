/* One verified lab account across Activities and Adhesives; no shared role passwords. */
(function(root){
 'use strict';let dialog,pending;
 function message(error){
  const code=error.code||'';
  if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(code))return 'The email or lab-app password was not accepted. Use the same account and password you created for Adhesives. If you forgot it, click Reset password and check your NVIDIA inbox.';
  if(code==='auth/email-already-in-use')return 'An account already exists for this email. Click Sign in, or Reset password if you forgot your lab-app password.';
  if(code==='auth/too-many-requests')return 'Sign-in is temporarily limited after several attempts. Wait a few minutes before trying again.';
  if(code==='auth/network-request-failed')return 'The sign-in service could not be reached. Check your connection and retry.';
  return error.message||'Sign-in could not be completed.';
 }
 function open(){
  if(dialog?.open)return pending;
  if(!dialog){
   const style=document.createElement('style');style.textContent='#firebaseSignIn::backdrop{background:rgba(0,0,0,.45)}#firebaseSignIn form{display:grid;gap:14px}#firebaseSignIn h2{font:700 24px/1.25 system-ui;margin:0}#firebaseSignIn p{margin:0}#firebaseSignIn label{display:grid;gap:6px}#firebaseSignIn input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b5c3cf;border-radius:8px;font:16px system-ui;background:white;color:#172033}#firebaseSignIn button{font:600 14px system-ui;border:1px solid #bbc9d3;border-radius:8px;padding:11px 14px;background:#eef3f8;color:#172033;cursor:pointer}#firebaseSignIn button[data-action=signIn]{background:#0068d9;color:white;border-color:#0068d9}#firebaseSignIn button:disabled{opacity:.6;cursor:wait}#firebaseSignIn [role=status]{line-height:1.5;overflow-wrap:anywhere;background:#fff4dc;padding:12px;border-radius:8px}#firebaseSignIn [role=status]:empty{display:none}';document.head.append(style);
   dialog=document.createElement('dialog');dialog.id='firebaseSignIn';dialog.style.cssText='position:fixed;inset:0;margin:auto;box-sizing:border-box;background:white;color:#172033;border:1px solid #76b900;border-radius:18px;padding:26px;max-width:480px;width:calc(100% - 32px);max-height:calc(100dvh - 32px);overflow:auto;font:15px/1.5 system-ui;';
   dialog.innerHTML='<form method="dialog"><h2>Process Lab sign-in</h2><p>Manager / Owner only: use your verified NVIDIA email and the same lab-app password as Adhesives. Viewer and Lab Practical Engineer use name only.</p><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Lab-app password<input name="password" type="password" autocomplete="current-password"></label><small>Use the password you chose when you created your lab-app account. New accounts require at least 12 characters.</small><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-action="signIn">Sign in</button><button type="button" data-action="resetPassword">Reset password</button><button type="button" data-action="register">Create account</button><button type="button" data-action="refresh">I verified my email</button><button type="button" data-action="sendVerification">Resend verification</button><button value="cancel" formnovalidate>Close</button></div><p role="status" aria-live="polite"></p></form>';
   document.body.append(dialog);
  }
  const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');status.textContent='';
  form.elements.email.value=root.LabFirebaseAuth.user()?.email||new URLSearchParams(location.hash.slice(1)).get('email')||'';
  pending=new Promise(resolve=>{dialog.onclose=()=>{form.elements.password.value='';resolve(root.LabFirebaseAuth.user());};});
  async function act(action){
   const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);status.textContent='Please wait…';
   try{
    if(action==='signIn'||action==='register')await root.LabFirebaseAuth[action](form.elements.email.value,form.elements.password.value);
    else if(action==='resetPassword'){await root.LabFirebaseAuth.resetPassword(form.elements.email.value);status.textContent='If this email has a lab-app account, a password reset email will arrive. Check your NVIDIA inbox and Junk/Spam, set a new password, then return here and click Sign in.';return;}
    else {if(!root.LabFirebaseAuth.user())throw Error('Sign in or create your account first.');await root.LabFirebaseAuth[action]();}
    form.elements.password.value='';const user=root.LabFirebaseAuth.user();
    if(user?.emailVerified)dialog.close('success');
    else if(action==='register'||action==='sendVerification')status.textContent='Verification email requested for '+user.email+'. Open its link in your NVIDIA inbox, then click I verified my email.';
    else status.textContent='This account is not yet verified. Open the verification link, or click Resend verification.';
   }catch(error){status.textContent=message(error);}finally{controls.forEach(b=>b.disabled=false);}
  }
  form.querySelector('[data-action="signIn"]').type='submit';
  dialog.onclick=e=>{const action=e.target.dataset.action;if(action&&e.target.type!=='submit')act(action);};
  form.onsubmit=e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();act('signIn');};
  dialog.showModal();form.elements.email.focus();return pending;
 }
 root.LabFirebaseSignIn={open};
})(globalThis);
