(() => {
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 async function action(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${location.hash.slice(1)}`},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d;}
 window.addEventListener('meridian-project-loaded',({detail:p})=>{
  const analysis=document.getElementById('project-analysis'),actions=document.getElementById('project-offer-actions'),work=document.getElementById('project-work');
  if(!analysis||!actions||!work)return;analysis.replaceChildren();actions.replaceChildren();work.replaceChildren();analysis.hidden=!p.analysis;actions.hidden=!p.analysis;work.hidden=!p.workPlan;
  if(!p.analysis)return;
  analysis.append(node('div','Website analysis','ey'),node('h2','Observed issues. Clear next steps.'));
  const grid=node('div','','grid');for(const f of p.analysis.findings){const card=node('article','','card');card.append(node('span',f.priority+' priority','ey'),node('h3',f.title),node('p',f.evidence),node('p',f.fix));grid.append(card);}analysis.append(grid,node('p',p.analysis.limits.join(' '),'note'));
  const message=node('p','','status');message.setAttribute('role','status');
  if(p.proposal.status==='offered'){
   actions.append(node('h3',`Review offer revision ${p.proposal.revision}`),node('p','Read the complete scope, fees, timing, provider costs and exclusions below before approving. Approval opens intake; live deployment follows verified access and acceptance.'));
   const form=node('form','','form'),label=node('label','Approval owner'),name=document.createElement('input');name.className='field';name.required=true;name.maxLength=160;label.append(name);
   const consent=node('label','','check full'),box=document.createElement('input');box.type='checkbox';box.required=true;consent.append(box,node('span',`I approve the written scope and commercial terms of revision ${p.proposal.revision} and authorize Meridian to prepare this agreed work.`));
   const button=node('button','Approve this offer →','btn primary');button.type='submit';form.append(label,consent,button,message);actions.append(form);
   form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await action('/api/opportunities/approve',{revision:p.proposal.revision,acceptedBy:name.value,approved:box.checked});document.getElementById('refresh-project').click();}catch(error){message.textContent=error.message;button.disabled=false;}});
  }else if(p.proposal.status==='approved'){actions.append(node('h3','Your scope is approved.'),node('p','Complete intake below. Your delivery plan and current stage will show what happens next.'));}
  else {
   actions.append(node('h3','Choose the scope to explore.'));
   const row=node('div','','actions');for(const offer of p.proposal.offers||[]){const b=node('button','Request '+offer.tier,'btn');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{const d=await action('/api/opportunities/request-offer',{tier:offer.tier});message.textContent=d.message;}catch(error){message.textContent=error.message;}finally{b.disabled=false;}});row.append(b);actions.append(node('p',`${offer.tier}: ${offer.focus}`));}actions.append(row,message);
   if(p.offerRequest)message.textContent=`${p.offerRequest.tier} offer requested. Meridian is confirming the final terms.`;
  }
  if(p.workPlan){work.append(node('h2','Your approved work plan'));const list=node('ul');for(const t of p.workPlan.tasks)list.append(node('li',`${t.label} — ${t.status}`));work.append(list,node('p',p.workPlan.boundaries,'note'));for(const review of p.operatingReviews||[]){work.append(node('h3','Operating review · '+new Date(review.at).toLocaleDateString()),node('p',`${review.analysis.findings.length} observed issues · New: ${review.changes.newIssues.join(', ')||'none'} · Resolved: ${review.changes.resolvedIssues.join(', ')||'none'}`));}}
 });
})();
