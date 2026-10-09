import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'meridian-growth-'));
process.env.DATA_DIR=dir;process.env.PUBLIC_BASE_URL='https://meridian.example';
const g=await import('../lib/growth-engine.mjs');
const {getLead,upsertLead}=await import('../engine.mjs');
const {isPublicAddress,websiteUrl,analyzePage,fetchPublicPage}=await import('../lib/website-analysis.mjs');
const fixture={url:'https://business.example/',html:'<html><head><title>Example business</title></head><body><h1>Services</h1><img src="photo.jpg"></body></html>',bytes:140,elapsedMs:10};
after(()=>rmSync(dir,{recursive:true,force:true}));
test('Analyzer blocks credentials, custom ports, literal addresses, private and reserved DNS targets',async()=>{
 for(const raw of ['http://business.example','https://127.0.0.1','https://user:pass@business.example','https://business.example:444','https://metadata.internal'])assert.throws(()=>websiteUrl(raw));
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','224.0.0.1','192.0.2.1','198.18.0.1','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
 let called=false;await assert.rejects(()=>fetchPublicPage('https://business.example',{lookup:async()=>[{address:'127.0.0.1',family:4}],request:()=>{called=true;}}));assert.equal(called,false);
});
test('Analysis provides observed evidence and distinguishes unmeasured performance',()=>{
 const a=analyzePage(fixture);assert(a.findings.some(f=>f.id==='viewport'));assert(a.findings.some(f=>f.id==='image-alt'));assert(a.findings.every(f=>f.sourceUrl===fixture.url));assert(a.limits.some(t=>t.includes('No measured rankings')));assert.equal(a.metrics.fetchElapsedMs,10);
 const healthy=analyzePage({...fixture,html:'<title>Business</title><meta name="viewport" content="width=device-width"><meta name="description" content="Services"><link rel="canonical" href="https://business.example/"><h1>Business</h1><a href="tel:+15555555555">Call</a>'});assert.equal(healthy.findings.length,0);
});
let lead;
test('Interest creates an evidence-based draft and private project; no unapproved work',async()=>{
 lead=await g.createOpportunity({email:'owner@example.com',name:'Owner',businessName:'Business',businessWebsite:fixture.url,consent:true},{fetchPage:async()=>fixture});
 assert.equal(lead.agency.proposal.status,'scope_required');assert.equal(lead.agency.token.length,48);assert.equal(g.readGrowth().jobs.length,1);
 assert.throws(()=>g.approveOpportunity(lead,{revision:1,approved:true,acceptedBy:'Owner'}));
 await assert.rejects(()=>g.createOpportunity({email:lead.email,name:'Owner',businessName:'Business',businessWebsite:fixture.url,consent:true},{fetchPage:async()=>fixture}));
});
test('Written quote requires fees, scope, timing and costs; stale approval is rejected',()=>{
 assert.throws(()=>g.issueOpportunityQuote(lead.id,{tier:'foundation',currency:'CAD',setupFee:99,monthlyFee:10}));
 lead=g.issueOpportunityQuote(lead.id,{tier:'foundation',currency:'CAD',setupFee:99,monthlyFee:10,scopeNotes:'One website enquiry workflow with approved pages only.',timing:'Within agreed delivery window',providerCosts:'Third-party usage quoted separately'});
 assert.equal(lead.agency.proposal.status,'offered');assert.throws(()=>g.approveOpportunity(lead,{revision:1,approved:true,acceptedBy:'Owner'}));
 lead=g.approveOpportunity(lead,{revision:lead.agency.proposal.revision,approved:true,acceptedBy:'Owner'});assert.equal(lead.agency.stage,'intake');assert.equal(lead.agency.proposal.status,'approved');assert.throws(()=>g.issueOpportunityQuote(lead.id,{}));
 g.enqueueGrowth('delivery-plan',lead.id,`delivery-plan:${lead.id}:${lead.agency.proposal.revision}`);assert.equal(g.readGrowth().jobs.filter(j=>j.type==='delivery-plan').length,1);
});
test('Worker confirms provider acceptance, prepares work once and blocks deployment without intake/design',async()=>{
 const calls=[];await g.runGrowthCycle({email:async p=>{calls.push(p);return {ok:true};}});assert.equal(calls.length,2);assert(calls.every(p=>p.to==='owner@example.com'&&p.text.includes('/meridian-onboarding.html#')));assert(getLead(lead.id).agency.workPlan.tasks.length);
 await g.runGrowthCycle({email:async()=>{throw new Error('duplicate email')}});assert.equal(g.readGrowth().jobs.filter(j=>j.status==='completed').length,3);
 g.enqueueGrowth('deployment-prepare',lead.id);await g.runGrowthCycle();assert.equal(g.readGrowth().jobs.find(j=>j.type==='deployment-prepare').status,'blocked');
 assert.throws(()=>g.configureContinuousReview(lead.id,{enabled:true,scopeApproved:true,scope:'Monitor the agreed workflow.'}));
});
test('Approved templates automate matching new offers; campaign results remain unqualified and bounded',async()=>{
 const service=lead.agency.proposal.service;
 g.saveOfferTemplate({service,tier:'foundation',currency:'CAD',setupFee:200,monthlyFee:50,scopeNotes:'Fix observed HTML issues within the agreed pages.',timing:'Two weeks after access',providerCosts:'No additional provider costs in this template.',ownerApproved:true,enabled:true});
 const l=await g.createOpportunity({email:'next@example.com',name:'Next',businessName:'Next business',businessWebsite:fixture.url,consent:true},{fetchPage:async()=>fixture});assert.equal(l.agency.proposal.status,'offered');assert.equal(l.agency.proposal.quote.setupFee,200);
 const c=g.createResearchCampaign({niche:'Roofers',location:'Sudbury',dailyLimit:2,researchApproved:true});assert.equal(c.status,'paused');g.setResearchCampaign(c.id,true);
 const search=async()=>({ok:true,provider:'fixture',results:[{title:'Business one',url:'https://one.example',snippet:'Roofing business'},{title:'Business duplicate',url:'https://one.example',snippet:'Duplicate'},{title:'Private',url:'https://127.0.0.1'}]});
 await g.runGrowthCycle({email:async()=>({ok:false,reason:'not_configured'}),search,fetchPage:async()=>fixture});const campaign=g.readGrowth().campaigns.find(x=>x.id===c.id);assert.equal(campaign.results.length,1);assert.equal(campaign.results[0].outreachAllowed,false);assert.equal(campaign.results[0].status,'website_verified_business_fit_pending');
 const verified=await g.verifyResearchCandidate(c.id,campaign.results[0].id,{fetchPage:async()=>fixture});assert.equal(verified.status,'website_verified_business_fit_pending');assert.equal(verified.outreachAllowed,false);
 assert(g.readGrowth().jobs.some(j=>j.status==='blocked'&&j.error==='not_configured'));
});
test('Corrupt queue fails closed instead of losing state',()=>{
 const file=path.join(dir,'growth-engine.json'),saved=readFileSync(file);writeFileSync(file,'{bad');assert.throws(()=>g.readGrowth());writeFileSync(file,saved);
});
test('Approved intake and design prepare a blocked deployment rather than falsely activating it',async()=>{
 const fresh=getLead(lead.id);upsertLead({id:lead.id,agency:{...fresh.agency,stage:'design',designApproved:true,intake:{hours:'Mon–Fri 9–5',services:'Roofing',owner:'Owner',rules:'Escalate uncertain enquiries.'}}});
 const job=g.readGrowth().jobs.find(j=>j.type==='deployment-prepare'&&j.projectId===lead.id);g.retryGrowthJob(job.id);await g.runGrowthCycle({email:async()=>({ok:false,reason:'no_email'})});
 const prepared=getLead(lead.id);assert.equal(prepared.agency.stage,'build');assert(prepared.agency.deploymentId);const completed=g.readGrowth().jobs.find(j=>j.id===job.id);assert.equal(completed.status,'completed');assert.equal(completed.result.readiness.canActivate,false);assert(completed.result.blockers.length>0);
});
test('HTTP growth routes protect operator controls and reject invalid customer approval',async()=>{
 const express=(await import('express')).default;const {registerGrowthRoutes}=await import('../lib/growth-routes.mjs');
 const app=express();app.use(express.json());registerGrowthRoutes(app,{admin:req=>req.get('Authorization')==='Bearer local-operator',publicLimiter:(_req,_res,next)=>next(),rejectObviousBots:(_req,_res,next)=>next(),checkFormBot:()=>({ok:true}),projectFor:()=>null,publicProject:l=>({id:l.id})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const denied=await fetch(base+'/api/ops/growth');assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'no-store');
  const allowed=await fetch(base+'/api/ops/growth',{headers:{Authorization:'Bearer local-operator'}});assert.equal(allowed.status,200);
  const approval=await fetch(base+'/api/opportunities/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:true,revision:2})});assert.equal(approval.status,401);
  const invalid=await fetch(base+'/api/ops/growth/campaigns',{method:'POST',headers:{Authorization:'Bearer local-operator','Content-Type':'application/json'},body:JSON.stringify({niche:'roofing',location:'Sudbury',researchApproved:true,dailyLimit:10000})});assert.equal(invalid.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('HTTPS fetching pins approved DNS and revalidates redirects',async()=>{
 const {EventEmitter}=await import('node:events');let pinned;
 const request=(_url,options,callback)=>{
  options.lookup('business.example',{all:false},(_err,address)=>pinned=address);
  const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};callback(res);res.emit('data',Buffer.from('<title>Fixture</title>'));res.emit('end');req.emit('close');});return req;
 };
 const page=await fetchPublicPage('https://business.example',{lookup:async()=>[{address:'8.8.8.8',family:4}],request});assert.equal(pinned,'8.8.8.8');assert.equal(page.bytes,22);
 const redirect=(_url,_options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>req;req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://127.0.0.1/private'};callback(res);res.emit('end');req.emit('close');});return req;};
 await assert.rejects(()=>fetchPublicPage('https://business.example',{lookup:async()=>[{address:'8.8.8.8',family:4}],request:redirect}),/public HTTPS/);
});
