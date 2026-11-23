/* Name-only Activities sessions use a separate Firebase app; owner/Adhesives sign-in is preserved. */
(function(root){
 'use strict';let anonymous,readyPromise,sdk;
 const modeKey='activities-auth-mode-v1';
 const nameMode=()=>sessionStorage.getItem(modeKey)==='name';
 async function anonymousReady(){
  if(!readyPromise)readyPromise=(async()=>{
   const [apps,auth]=await Promise.all([import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js')]);sdk=auth;
   const name='activities-name-only',app=apps.getApps().find(a=>a.name===name)||apps.initializeApp(root.LabFirebaseConfig,name);
   anonymous=auth.getAuth(app);await auth.setPersistence(anonymous,auth.browserLocalPersistence);await anonymous.authStateReady();
  })().catch(e=>{readyPromise=null;throw e;});return readyPromise;
 }
 async function ready(){await root.LabFirebaseAuth.ready();if(nameMode())await anonymousReady();}
 function user(){return nameMode()?anonymous?.currentUser:root.LabFirebaseAuth.user();}
 async function beginName(){
  try{await anonymousReady();if(!anonymous.currentUser)await sdk.signInAnonymously(anonymous);if(!anonymous.currentUser?.isAnonymous)throw Error('The name-only session is invalid. Sign out and retry.');sessionStorage.setItem(modeKey,'name');return user();}
  catch(e){if(['auth/operation-not-allowed','auth/admin-restricted-operation'].includes(e.code))throw Error('Name-only access needs one owner setup step: in Firebase Authentication → Sign-in method, enable Anonymous and save. Then retry.');throw e;}
 }
 function owner(){sessionStorage.setItem(modeKey,'owner');}
 async function getIdToken(){await ready();return nameMode()?user()?.getIdToken():root.LabFirebaseAuth.getIdToken();}
 async function refresh(){await ready();return nameMode()?user():root.LabFirebaseAuth.refresh();}
 async function signOut(){if(nameMode()){await anonymousReady();await sdk.signOut(anonymous);}else await root.LabFirebaseAuth.signOut();sessionStorage.removeItem(modeKey);}
 root.ActivitiesNameAuth={ready,user,beginName,owner,getIdToken,refresh,signOut};
})(globalThis);
