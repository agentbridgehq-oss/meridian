import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { PLANS } from '../lib/pricing.mjs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public CAD plans match the authoritative billing amounts',()=>{
  const home=read('public/index.html');
  for(const plan of Object.values(PLANS)) {
    assert.ok(home.includes(plan.name));
    assert.ok(home.includes(`CA$${plan.monthlyCents/100}`));
    assert.ok(home.includes(`/checkout/${plan.id}`));
  }
  assert.match(home,/60-minute safety ceiling/);
  assert.match(home,/CA\$0\.45\/minute and CA\$0\.07\/SMS/);
});

test('checkout and private delivery routing reach the existing runtime',()=>{
  const config=read('netlify.toml'), redirects=read('public/_redirects');
  for(const route of ['checkout','setup','guide']) {
    assert.ok(config.includes(`from = "/${route}/*"`));
    assert.ok(config.includes(`to = "https://meridian-production-4996.up.railway.app/${route}/:splat"`));
    assert.ok(redirects.includes(`/${route}/* https://meridian-production-4996.up.railway.app/${route}/:splat 200!`));
  }
});

test('customer-facing guides describe the current phone provider and no retired host',()=>{
  for(const file of ['public/install-guide.html','public/voice-connect.html',...['voice','sales','booking','service'].map(x=>`public/agent-${x}.html`)]) {
    const html=read(file);
    assert.match(html,/xAI/);
    assert.equal(/meridian-production-(2eb0|915d)/.test(html),false,file);
    assert.equal(html.includes('Configure OPENAI_API_KEY and OPENAI_WEBHOOK_SECRET there'),false,file);
  }
  assert.match(read('public/voice-connect.html'),/api\/xai\/webhooks\/realtime/);
});

function checklistHarness(blockedStorage=false) {
  const checks=Array.from({length:5},(_,i)=>({dataset:{setupCheck:String(i)},checked:false,addEventListener(_,fn){this.change=fn;}}));
  const progress={textContent:''}, reset={addEventListener(_,fn){this.click=fn;}}, help={addEventListener(_,fn){this.click=fn;}};
  const records=[];let opened='';
  vm.runInNewContext(read('public/js/customer-setup-checklist.js'),{
    document:{querySelectorAll:()=>checks,getElementById:id=>({'setup-progress':progress,'reset-setup-checks':reset,'setup-help':help})[id]},
    window:{MeridianGuide:{open:tab=>opened=tab}},
    localStorage:{getItem(){if(blockedStorage)throw new Error('blocked');return null;},setItem(_,value){if(blockedStorage)throw new Error('blocked');records.push(JSON.parse(value));}},
  });
  return {checks,progress,reset,help,records,get opened(){return opened;}};
}
test('preparation checklist saves booleans only and never declares a live deployment',()=>{
  const h=checklistHarness();h.checks[0].checked=true;h.checks[0].change();
  assert.match(h.progress.textContent,/1 of 5/);
  assert.match(h.progress.textContent,/launch still requires verification/);
  assert.ok(Object.values(h.records.at(-1)).every(x=>typeof x==='boolean'));
  h.help.click();assert.equal(h.opened,'setup');h.reset.click();assert.ok(h.checks.every(c=>!c.checked));
});
test('setup help works when browser storage is blocked',()=>{
  const h=checklistHarness(true);h.checks[0].checked=true;h.checks[0].change();assert.match(h.progress.textContent,/1 of 5/);
});
