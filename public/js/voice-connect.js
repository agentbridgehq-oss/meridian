(() => {
  const q=s=>document.querySelector(s), refresh=q('#connection-refresh');
  let loading=false;
  function check(name,text,ready){const el=q(`[data-check="${name}"]`);el.textContent=text;el.dataset.state=ready?'ready':'pending';}
  async function get(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('unavailable');return r.json();}
  async function load(){
    if(loading)return;loading=true;refresh.disabled=true;
    try{
      const [runtime,studio]=await Promise.allSettled([get('/api/voice/connections'),get('/api/voice/status')]);
      if(runtime.status==='fulfilled'){
        const data=runtime.value;
        check('browser',data.browser.available?'Ready for a browser conversation':'Awaiting voice engine configuration',data.browser.available);
        check('phone',data.phone.credentialsConfigured?'Credentials configured · real-call acceptance still required':'Awaiting phone credentials and verified routing',false);
        q('#connection-overall').textContent=data.browser.available?'Voice lab ready':'Setup in progress';
        q('#connection-next').textContent=data.nextAction;
        q('#connection-checked').textContent='Last checked '+new Date(data.checkedAt).toLocaleTimeString();
      }else{
        check('browser','Runtime status could not be confirmed',false);check('phone','Runtime status could not be confirmed',false);
        q('#connection-overall').textContent='Status unavailable';q('#connection-next').textContent='Retry the connection check. No connection is assumed.';
      }
      const ready=studio.status==='fulfilled'&&studio.value.elevenlabs===true;
      check('studio',ready?'Configured for ElevenLabs studio samples':'Awaiting ElevenLabs sample configuration',ready);
    }finally{loading=false;refresh.disabled=false;}
  }
  async function copy(id,button){try{await navigator.clipboard.writeText(q(id).textContent);const before=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=before,1500);}catch{q('#sip-project-help').textContent='Select and copy the displayed address manually.';}}
  const input=q('#sip-project-id'),sip=q('#copy-sip');
  input.addEventListener('input',()=>{
    const value=input.value.trim(),valid=/^proj_[A-Za-z0-9_-]{3,120}$/.test(value);
    q('#sip-destination').textContent=valid?`sip:${value}@sip.api.openai.com;transport=tls`:'Enter a valid OpenAI project ID. Never enter a secret API key.';
    sip.disabled=!valid;
  });
  sip.addEventListener('click',()=>copy('#sip-destination',sip));
  q('#copy-webhook').addEventListener('click',e=>copy('#webhook-endpoint',e.currentTarget));
  refresh.addEventListener('click',load);load();
})();
