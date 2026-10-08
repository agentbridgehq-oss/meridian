const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
class El {
 constructor(text=''){this.textContent=text;this.attrs={};this.listeners={};this.children={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>{if(on)this.classes.add(x);else this.classes.delete(x)}};this.scrollLeft=0;this.clientWidth=350;this.scrollWidth=2500;}
 setAttribute(k,v){this.attrs[k]=v} getAttribute(k){return this.attrs[k]} removeAttribute(k){delete this.attrs[k]}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)} emit(k,e={}){for(const f of this.listeners[k]??[])f(e)} click(){if(!this.disabled)this.emit('click')}
 querySelector(k){return this.children[k]} querySelectorAll(k){return this.children[k]??[]} replaceChildren(...c){this.textContent=c.map(x=>x.textContent).join('')}
 getBoundingClientRect(){return {left:this.left||0,width:350,height:300}}scrollBy({left}){this.scrollLeft=Math.max(0,Math.min(2150,this.scrollLeft+left));this.emit('scroll')}
 focus(){this.focused=true}
}
const choice=['Missed call','New web lead','Quote request','Appointment request'].map(t=>{const e=new El;e.children.strong=new El(t);return e});
const steps=Array.from({length:5},()=>new El),nodes=Array.from({length:8},()=>new El),cards=Array.from({length:7},(_,i)=>{const e=new El;e.left=i*363;return e});
const selectors=Object.fromEntries(['#demo-play','#demo-status','#traceTitle','#demo-reset','#primary-nav','.menu-toggle','.layer-detail .k','.layer-detail p','#services-rail','#services-prev','#services-next','.rail-position','#scan-router','.mobile-plan','.hero-stage','#scan','.final','#demo'].map(k=>[k,new El]));
selectors['#services-rail'].children['.svc']=cards;
let reduced=false;const docListeners={};
const document={hidden:false,querySelector:k=>selectors[k]??null,querySelectorAll:k=>({'.choice':choice,'.trace .step':steps,'.flow .nb':nodes,'.head, .scan, .system':[]}[k]??[]),createElement:()=>new El,createTextNode:text=>new El(text),addEventListener:(k,f)=>docListeners[k]=f};
let timerId=0;const timers=new Map;
const env={document,matchMedia:()=>({get matches(){return reduced},addEventListener(){}}),IntersectionObserver:class{constructor(f){this.f=f}observe(){}unobserve(){}},ResizeObserver:class{observe(){}},setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id),window:{addEventListener(){}},location:{assign(){}},requestAnimationFrame(){throw Error('No canvas expected')},cancelAnimationFrame(){}};
vm.runInNewContext(fs.readFileSync('public/js/agency-home.js','utf8'),env);
assert.equal(choice[0].getAttribute('aria-pressed'),'true');assert.equal(nodes[0].getAttribute('aria-pressed'),'true');
selectors['#demo-play'].click();assert.equal(selectors['#demo-status'].textContent,'Step 1 of 5');assert.equal(steps[0].getAttribute('aria-current'),'step');
selectors['#demo-play'].click();assert.equal(timers.size,0);assert.equal(selectors['#demo-play'].textContent,'Continue workflow →');
choice[2].click();assert.equal(selectors['#traceTitle'].textContent,'QUOTE REQUEST');assert.equal(selectors['#demo-play'].textContent,'Play workflow →');assert.match(steps[0].textContent,/Quote request/);
selectors['#demo-play'].click();while(timers.size){const [id,f]=timers.entries().next().value;timers.delete(id);f()}assert.equal(selectors['#demo-status'].textContent,'Complete · outcome recorded');assert.equal(selectors['#demo-play'].textContent,'Replay workflow →');
selectors['#demo-reset'].click();assert.equal(selectors['#demo-status'].textContent,'Ready · 5 steps');
reduced=true;selectors['#demo-play'].click();assert.equal(timers.size,0);assert.equal(selectors['#demo-status'].textContent,'Complete · outcome recorded');
nodes[5].click();assert.match(selectors['.layer-detail p'].textContent,/verify integrations/);assert.equal(nodes[5].getAttribute('aria-pressed'),'true');assert.equal(nodes[0].getAttribute('aria-pressed'),'false');
selectors['.menu-toggle'].click();assert.equal(selectors['.menu-toggle'].getAttribute('aria-expanded'),'true');docListeners.keydown({key:'Escape'});assert.equal(selectors['.menu-toggle'].getAttribute('aria-expanded'),'false');assert.ok(selectors['.menu-toggle'].focused);
assert.equal(selectors['#services-prev'].disabled,true);selectors['#services-next'].click();assert.equal(selectors['#services-rail'].scrollLeft,363);
console.log('11 interaction checks passed: select/play/pause/complete/reset/reduced motion/layer/menu/Escape/carousel states.');
