/* Read-only migration reader. Never updates the original Gist or publishes a public snapshot. */
(function(root){
 'use strict';
 async function read(token='',fetcher=root.fetch.bind(root)){
  token=String(token).trim();if(token&&!/^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})$/.test(token))throw Error('The optional source field expects a GitHub access token, not your NVIDIA or lab-app password. Leave it blank to read without a token.');
  const base='https://api.github.com/gists/8a640ad7fe31d7a2ac5637dd4de868f5',J=root.TrackerJournal;
  async function get(path=''){
   const r=await fetcher(base+path,{headers:{Accept:'application/vnd.github+json',...token?{Authorization:'Bearer '+token}:{}},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
   if(!r.ok){if(r.status===403||r.status===429)throw Error('GitHub source access is rate-limited or refused. Wait for its quota reset, or enter an owner GitHub token for this one-time read. No data was copied.');throw Error('Source read failed (HTTP '+r.status+'). No data was copied.');}return r.json();
  }
  const gist=await get();if(gist.owner?.login?.toLowerCase()!=='yousefmahajna')throw Error('Unexpected source owner.');const records=[],seen=new Set();
  for(let page=1;page<=500;page++){
   const comments=await get('/comments?per_page=100&page='+page);if(!Array.isArray(comments))throw Error('Invalid journal response.');
   for(const c of comments){if(c.user?.login?.toLowerCase()!=='yousefmahajna')continue;let e;try{e=JSON.parse(c.body);}catch{continue;}if(e.marker!==J.MARKER)continue;if(!e.record||e.sha256!==await J.hash(e.record)||!Number.isSafeInteger(c.id)||seen.has(c.id))throw Error('The source journal has an incomplete or duplicate record. Migration blocked.');seen.add(c.id);records.push({record:e.record,sequence:c.id,at:c.created_at});}
   if(comments.length<100)break;if(page===500)throw Error('The source journal is too large to read completely.');
  }
  records.sort((a,b)=>a.sequence-b.sequence);const bases=records.filter(r=>r.record.kind==='baseline');if(!bases.length)throw Error('The Activities source has not been initialized. The existing data was not changed.');
  if(bases.slice(1).some(r=>r.record.sourceHash!==bases[0].record.sourceHash))throw Error('Conflicting source baselines require owner review.');
  const result=await J.reduce(bases[0].record,records.filter(r=>r.record.kind==='change'));
  result.history.unshift({seq:bases[0].sequence,at:bases[0].at,actor:'Original GitHub migration',role:'admin',changes:[{type:'initial.import'}],before:{data:[],emailRecipients:[]},after:JSON.parse(JSON.stringify(bases[0].record.state))});
  if(result.state.folderIssues.length)throw Error('The source has unresolved journal integrity warnings. Migration blocked.');return result;
 }
 root.ActivitiesSource={read};
})(globalThis);
