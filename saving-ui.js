/* GitHub saving is an explicit, memory-only connection, separate from lab roles. */
(function () {
  'use strict';
  function mount() {
    const action=document.createElement('button');action.id='connect-saving';action.className='btn-cancel';action.type='button';action.textContent='Connect saving';
    const note=document.createElement('span');note.id='saving-connection-status';note.style.cssText='font-size:11px;color:var(--text-3)';
    const dialog=document.createElement('dialog');dialog.id='saving-dialog';dialog.style.cssText='margin:auto;border:1px solid #D0CFC9;border-radius:14px;padding:24px;max-width:480px;width:92vw;color:#1A1A18';
    const title=document.createElement('h2');title.textContent='Connect shared saving';title.style.fontSize='18px';
    const help=document.createElement('p');help.style.cssText='margin:12px 0;font-size:13px';help.textContent='Use a GitHub token for the shared Activities Gist owner with Gists: Read and write permission. The token stays in this tab’s memory and clears when the tab closes or reloads. Pending changes remain on this browser until saved.';
    const label=document.createElement('label');label.textContent='GitHub token';label.htmlFor='saving-token';
    const input=document.createElement('input');input.id='saving-token';input.type='password';input.autocomplete='off';input.className='login-pw-input';input.style.margin='8px 0';
    const error=document.createElement('p');error.id='saving-error';error.setAttribute('role','status');error.style.cssText='font-size:12px;color:#C03030;margin:8px 0';
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:16px';
    const connect=document.createElement('button');connect.type='button';connect.className='btn-save';connect.textContent='Connect';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='btn-cancel';cancel.textContent='Cancel';
    actions.append(connect,cancel);dialog.append(title,help,label,input,error,actions);document.body.append(dialog);
    document.querySelector('.header-left').append(action,note);
    const loginConnect=document.createElement('button');loginConnect.id='login-connect-saving';loginConnect.className='btn-cancel';loginConnect.type='button';loginConnect.textContent='Connect saving (owner)';loginConnect.style.marginTop='16px';document.querySelector('.login-card').append(loginConnect);loginConnect.onclick=()=>action.onclick();
    function refresh(){
      const canSave=!document.getElementById('login-screen').classList.contains('show')&&!document.body.classList.contains('activities-viewer');
      action.hidden=!canSave;note.hidden=!canSave;loginConnect.hidden=!document.getElementById('login-screen').classList.contains('show');
      const connected=activitySaving.isConnected();action.textContent=connected?'Disconnect saving':'Connect saving';
      note.textContent=connected?'Saving connected':'Drafts kept on this browser';
    }
    action.onclick=()=>{
      if(activitySaving.isConnected()){activitySaving.disconnect();refresh();window.dispatchEvent(new Event('activities-saving-changed'));return;}
      error.textContent='';input.value='';dialog.showModal();input.focus();
    };
    cancel.onclick=()=>{input.value='';dialog.close();};
    dialog.addEventListener('cancel',()=>{input.value='';});dialog.addEventListener('close',()=>{input.value='';});
    connect.onclick=async()=>{
      connect.disabled=true;cancel.disabled=true;error.textContent='Connecting…';
      const candidate=input.value;input.value='';
      try{await activitySaving.connect(candidate);dialog.close();window.dispatchEvent(new Event('activities-saving-changed'));}
      catch(e){error.textContent=e.message;}
      finally{connect.disabled=false;cancel.disabled=false;input.value='';refresh();}
    };
    new MutationObserver(refresh).observe(document.getElementById('login-screen'),{attributes:true,attributeFilter:['class']});
    new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('activities-saving-changed',refresh);refresh();
    window.addEventListener('activities-saving-disconnected',refresh);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
