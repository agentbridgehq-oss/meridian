(() => {
 const form=document.getElementById('analysis-form');if(!form)return;
 const started=Date.now(),status=form.querySelector('.status'),button=form.querySelector('button');
 form.addEventListener('submit',async e=>{
  e.preventDefault();button.disabled=true;status.textContent='Checking your public website and preparing the first scope…';
  try {
   const body=Object.fromEntries(new FormData(form));body.consent=form.elements.consent.checked;body._formStartedAt=started;
   const r=await fetch('/api/opportunities/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();
   if(!r.ok)throw new Error(d.error||'Analysis could not complete.');
   const root=document.getElementById('analysis-findings');root.replaceChildren();
   const findings=d.project.analysis.findings;
   for(const f of findings){const card=document.createElement('article');card.className='card';for(const [tag,text] of [['h3',f.title],['p',f.evidence],['p',f.fix]]){const n=document.createElement(tag);n.textContent=text;card.append(n);}root.append(card);}
   if(!findings.length){const p=document.createElement('p');p.textContent='No issues were found by these basic HTML checks. A workflow review can explore gaps beyond the website.';root.append(p);}
   document.getElementById('analysis-limit').textContent=d.project.analysis.limits.join(' ');
   if(!/^\/meridian-onboarding\.html#[a-f0-9]{48}$/.test(d.onboardingPath))throw new Error('Private report link unavailable.');
   document.getElementById('analysis-private-link').href=d.onboardingPath;document.getElementById('analysis-result').hidden=false;
   status.textContent='Analysis saved. Your private report and draft scope are below.';button.textContent='Report ready';
   document.getElementById('analysis-result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }catch(error){status.textContent=error.message||'Connection failed. Your inputs are preserved. Please retry.';button.disabled=false;}
 });
})();
