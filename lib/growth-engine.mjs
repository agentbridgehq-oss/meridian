import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchPublicPage, analyzePage, websiteUrl } from './website-analysis.mjs';
import { draftProposal } from './agency-catalog.mjs';
import { listLeads, getLead, upsertLead } from '../engine.mjs';
import { sendOwnerEmail } from './notify.mjs';
import { webSearch } from './web-search.mjs';
import { createDeploymentFromAgencyLead, getDeployment, deploymentSummary } from './deployment-core.mjs';
const now=()=>new Date().toISOString();
const clean=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const storePath=()=>path.join(process.env.DATA_DIR||process.env.MERIDIAN_DATA_DIR||'data','growth-engine.json');
export function readGrowth() { try { const s=JSON.parse(fs.readFileSync(storePath(),'utf8'));if(!Array.isArray(s.jobs)||!Array.isArray(s.campaigns))throw new Error('Invalid growth store');return s; } catch(e) { if(e.code==='ENOENT')return {jobs:[],campaigns:[],templates:[]};throw e; } }
function writeGrowth(s) { const f=storePath();fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,f); }
export function enqueueGrowth(type,projectId,key=type+':'+projectId,payload={}) {const s=readGrowth();const old=s.jobs.find(j=>j.key===key);if(old)return old;const j={id:crypto.randomUUID(),key,type,projectId,payload,status:'queued',createdAt:now(),updatedAt:now()};s.jobs.push(j);writeGrowth(s);return j;}
export function opportunityProposal(input,analysis) {
  const service=analysis.findings[0]?.service||'automation';
  const base=draftProposal({...input,service,tier:'foundation'});
  const focused=analysis.findings.filter(f=>f.service===service).slice(0,4);
  return {...base,revision:1,analysisUrl:analysis.url,summary:focused.length?focused.map(f=>f.title).join(' · '):'Review the enquiry-to-follow-up workflow with your business owner.',deliverables:focused.length?[...focused.map(f=>f.fix),'Document the workflow, baseline and handoff owner.']:base.deliverables,acceptanceChecks:focused.length?[...focused.map(f=>`Recheck ${f.id} on the approved pages after implementation.`),'Verify enquiry delivery and failure handling with the owner.']:base.acceptanceChecks,findings:analysis.findings,offers:[{tier:'foundation',focus:'Resolve the highest-priority verified issue and one agreed workflow.'},{tier:'growth',focus:'Connect enquiry capture, qualification, follow-up and reporting.'},{tier:'scale',focus:'Expand approved workflows with monitoring, exception handling and continuous reviews.'}],nextStep:'Review your analysis, then request a final scope and written quote. No work or charges begin from the free scan.'};
}
export async function createOpportunity(input,{fetchPage=fetchPublicPage}={}) {
  const email=clean(input.email,254).toLowerCase();const name=clean(input.name,160),businessName=clean(input.businessName,160);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||!businessName||input.consent!==true)throw new Error('Name, business, valid email and permission to send the requested report are required.');
  const url=websiteUrl(clean(input.businessWebsite,1000)).href;
  if(listLeads().some(l=>l.email===email))throw new Error('Use your existing private Meridian link or contact Meridian to update your request.');
  const analysis=analyzePage(await fetchPage(url));
  if(listLeads().some(l=>l.email===email))throw new Error('A request for this email already exists. Use your existing private link.');
  const proposalInput={name,email,businessName,businessWebsite:url,service:analysis.findings[0]?.service||'automation',tier:'foundation',goals:clean(input.goals,4000)};
  const at=now();const lead=upsertLead({email,businessName,source:'website-analysis',consent:true,primaryNeed:proposalInput.service,stage:'agency_proposal',agency:{token:crypto.randomBytes(24).toString('hex'),input:proposalInput,analysis,proposal:opportunityProposal(proposalInput,analysis),stage:'proposal',consentAt:at,history:[{stage:'proposal',at,evidence:'Website HTML analysis completed; draft scope generated.'}]}});
  enqueueGrowth('report-email',lead.id);
  const template=(readGrowth().templates||[]).find(t=>t.service===proposalInput.service&&t.tier==='foundation'&&t.enabled);
  return template?issueOpportunityQuote(lead.id,template):lead;
}
export function issueOpportunityQuote(id,b) {
  const lead=getLead(id);if(!lead?.agency?.analysis)throw new Error('Analyzed project not found.');
  if(lead.agency.proposal.status==='approved')throw new Error('Approved scopes cannot be replaced here. Record a separate scope change.');
  if(!['foundation','growth','scale'].includes(b.tier)||b.currency!=='CAD'||![b.setupFee,b.monthlyFee].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||!clean(b.scopeNotes,4000)||!clean(b.timing,500)||!clean(b.providerCosts,1000))throw new Error('Choose a tier, CAD fees, final scope, delivery timing and provider costs.');
  const revision=(lead.agency.proposal.revision||1)+1;
  const proposal={...lead.agency.proposal,status:'offered',revision,tier:b.tier,quote:{setupFee:b.setupFee,monthlyFee:b.monthlyFee,currency:'CAD',scopeNotes:clean(b.scopeNotes,4000),timing:clean(b.timing,500),providerCosts:clean(b.providerCosts,1000),issuedAt:now()},nextStep:'Review the final scope and commercial terms. Approve this revision to open intake.'};
  upsertLead({id,agency:{...lead.agency,input:{...lead.agency.input,tier:b.tier},proposal,stage:'approval',history:[...lead.agency.history,{stage:'approval',at:now(),evidence:`Offer revision ${revision} issued.`}]}});
  enqueueGrowth('offer-email',id,`offer-email:${id}:${revision}`,{revision});return getLead(id);
}
export function approveOpportunity(lead,b) {
  const p=lead.agency?.proposal;
  if(!p?.quote||p.status!=='offered'||p.revision!==b.revision||b.approved!==true||!clean(b.acceptedBy,160))throw new Error('Review the current offered revision and record explicit approval.');
  const at=now();upsertLead({id:lead.id,agency:{...lead.agency,stage:'intake',proposal:{...p,status:'approved',quote:{...p.quote,approvedAt:at,acceptedBy:clean(b.acceptedBy,160)},nextStep:'Complete intake to prepare the approved delivery plan.'},history:[...lead.agency.history,{stage:'intake',at,evidence:`Customer ${clean(b.acceptedBy,160)} approved offer revision ${p.revision}.`}]}});
  enqueueGrowth('delivery-plan',lead.id,`delivery-plan:${lead.id}:${p.revision}`);return getLead(lead.id);
}
export function saveOfferTemplate(input) {
  if(!['automation','revenue-ops','search','web'].includes(input.service)||!['foundation','growth','scale'].includes(input.tier)||input.currency!=='CAD'||![input.setupFee,input.monthlyFee].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||input.ownerApproved!==true||!clean(input.scopeNotes,4000)||!clean(input.timing,500)||!clean(input.providerCosts,1000))throw new Error('Approve a service-specific template with CAD fees, bounded scope, timing and provider costs.');
  const s=readGrowth();s.templates=s.templates||[];const template={service:input.service,tier:input.tier,currency:'CAD',setupFee:input.setupFee,monthlyFee:input.monthlyFee,scopeNotes:clean(input.scopeNotes,4000),timing:clean(input.timing,500),providerCosts:clean(input.providerCosts,1000),enabled:input.enabled===true,approvedAt:now()};
  s.templates=s.templates.filter(t=>t.service!==template.service||t.tier!==template.tier);s.templates.push(template);writeGrowth(s);return template;
}
export function createResearchCampaign(input) {
  const niche=clean(input.niche,120),location=clean(input.location,120);
  if(!niche||!location||input.researchApproved!==true)throw new Error('A niche, location and research authorization are required.');
  const rawLimit=input.dailyLimit??20;if(!Number.isInteger(rawLimit)||rawLimit<1||rawLimit>50)throw new Error('Daily result limit must be 1–50.');
  const s=readGrowth(),c={id:crypto.randomUUID(),niche,location,dailyLimit:rawLimit,status:'paused',outreach:'disabled',results:[],queries:[],createdAt:now(),nextRunAt:now(),lastError:null,queryIndex:0};s.campaigns.push(c);writeGrowth(s);return c;
}
export function setResearchCampaign(id,enabled) {const s=readGrowth(),c=s.campaigns.find(c=>c.id===id);if(!c)throw new Error('Campaign not found.');c.status=enabled?'active':'paused';writeGrowth(s);return c;}
export async function verifyResearchCandidate(campaignId,candidateId,{fetchPage=fetchPublicPage}={}) {
  const s=readGrowth(),c=s.campaigns.find(c=>c.id===campaignId),candidate=c?.results.find(r=>r.id===candidateId);if(!candidate)throw new Error('Candidate not found.');
  const page=await fetchPage(candidate.url),analysis=analyzePage(page);
  const latest=readGrowth(),row=latest.campaigns.find(c=>c.id===campaignId)?.results.find(r=>r.id===candidateId);if(!row)throw new Error('Candidate changed.');
  Object.assign(row,{status:'website_verified_business_fit_pending',verifiedAt:now(),contacts:analysis.contacts,analysis,outreachAllowed:false});writeGrowth(latest);return row;
}
export function configureContinuousReview(id,b) {
  const lead=getLead(id);
  if(lead?.agency?.continuousReview&&b.enabled===false){upsertLead({id,agency:{...lead.agency,continuousReview:{...lead.agency.continuousReview,enabled:false}}});return getLead(id);}
  const deployment=lead?.agency?.deploymentId?getDeployment(lead.agency.deploymentId):null;
  if(!lead?.agency?.analysis||lead.agency.stage!=='operate'||lead.agency.proposal.status!=='approved'||deployment?.status!=='live'||b.scopeApproved!==true||clean(b.scope,2000).length<12)throw new Error('Continuous reviews require an approved operating scope and live verified deployment.');
  upsertLead({id,agency:{...lead.agency,continuousReview:{enabled:b.enabled===true,scope:clean(b.scope,2000),nextRunAt:now()}}});return getLead(id);
}
let busy=false;
export async function runGrowthCycle({email=sendOwnerEmail,search=webSearch,fetchPage=fetchPublicPage,max=5}={}) {
  if(busy)return {skipped:true,reason:'cycle_running'};busy=true;const outcomes=[];
  try {
    for(const lead of listLeads().filter(l=>l.agency?.continuousReview?.enabled&&l.agency.stage==='operate'&&new Date(l.agency.continuousReview.nextRunAt)<=new Date()).slice(0,3)) {
      enqueueGrowth('operations-review',lead.id,`operations-review:${lead.id}:${now().slice(0,10)}`);
      upsertLead({id:lead.id,agency:{...lead.agency,continuousReview:{...lead.agency.continuousReview,nextRunAt:new Date(Date.now()+86400000).toISOString()}}});
    }
    const jobIds=readGrowth().jobs.filter(j=>j.status==='queued').slice(0,max).map(j=>j.id);
    for(const id of jobIds) {
      let s=readGrowth(),job=s.jobs.find(j=>j.id===id);job.status='running';job.updatedAt=now();writeGrowth(s);
      try {
        const lead=getLead(job.projectId);if(!lead?.agency)throw new Error('Project not found');let result;
        if(job.type==='report-email'||job.type==='offer-email') {
          if(job.type==='offer-email'&&job.payload.revision!==lead.agency.proposal.revision) { result={superseded:true}; }
          else {
            const origin=new URL(process.env.PUBLIC_BASE_URL||'https://meridian-open.netlify.app');if(origin.protocol!=='https:')throw new Error('Configure an HTTPS PUBLIC_BASE_URL for private customer links.');
            const link=new URL('/meridian-onboarding.html',origin);link.hash=lead.agency.token;
            result=await email({to:lead.email,subject:job.type==='report-email'?'Your Meridian website analysis and draft scope':'Your Meridian scope and offer',text:`Requested by ${lead.agency.input.name}\n\n${lead.agency.proposal.summary}\n\n${lead.agency.analysis.findings.map(f=>`${f.title}: ${f.evidence}`).join('\n')}\n\nReview the private report, scope and terms:\n${link.href}\n\nThe free report does not activate paid work. Approval applies only to the written offer revision.`});
            if(!result?.ok)throw new Error(result?.reason||'Email provider did not confirm acceptance.');
          }
        } else if(job.type==='delivery-plan') {
          if(lead.agency.proposal.status!=='approved')throw new Error('Client scope approval required.');
          const tasks=lead.agency.proposal.deliverables.map((label,i)=>({id:`task_${i+1}`,label,status:'pending',evidence:null}));
          upsertLead({id:lead.id,agency:{...lead.agency,workPlan:{revision:lead.agency.proposal.revision,tasks,createdAt:now(),continuousWork:['Monitor agreed workflow health','Review exceptions and QA','Prepare SEO and content recommendations','Report results against the approved baseline'],boundaries:lead.agency.proposal.quote.scopeNotes}}});result={prepared:true,tasks:tasks.length};
        } else if(job.type==='deployment-prepare') {
          if(lead.agency.stage!=='design'||!lead.agency.designApproved||lead.agency.proposal.status!=='approved')throw new Error('Approved scope, intake and design review are required.');
          const d=createDeploymentFromAgencyLead(lead);if(!d.ok)throw new Error(d.error);
          upsertLead({id:lead.id,stage:'agency_build',agency:{...lead.agency,stage:'build',deploymentId:d.deployment.id,history:[...lead.agency.history,{stage:'build',at:now(),evidence:'Approved design prepared in deployment core; live activation still requires verified integrations, QA and rollback.'}]}});result=deploymentSummary(d.deployment);
        } else if(job.type==='operations-review') {
          const deployment=lead.agency.deploymentId?getDeployment(lead.agency.deploymentId):null;
          if(lead.agency.stage!=='operate'||!lead.agency.continuousReview?.enabled||deployment?.status!=='live')throw new Error('Operating review paused or deployment not live.');
          const analysis=analyzePage(await fetchPage(lead.agency.input.businessWebsite));
          const previous=lead.agency.operatingReviews?.at(-1)?.analysis||lead.agency.analysis;
          const report={at:now(),analysis,changes:{newIssues:analysis.findings.filter(f=>!previous.findings.some(p=>p.id===f.id)).map(f=>f.id),resolvedIssues:previous.findings.filter(f=>!analysis.findings.some(p=>p.id===f.id)).map(f=>f.id)},scope:lead.agency.continuousReview.scope,actions:analysis.findings.map(f=>({task:f.fix,status:'recommendation',evidence:f.evidence})),deployment:deploymentSummary(deployment)};
          const fresh=getLead(lead.id);upsertLead({id:lead.id,agency:{...fresh.agency,operatingReviews:[...(fresh.agency.operatingReviews||[]),report].slice(-30)}});result={reviewed:true,findings:analysis.findings.length};
        } else throw new Error('Unsupported job type.');
        s=readGrowth();job=s.jobs.find(j=>j.id===id);Object.assign(job,{status:'completed',result,updatedAt:now(),error:null});writeGrowth(s);
      } catch(e) {s=readGrowth();job=s.jobs.find(j=>j.id===id);Object.assign(job,{status:'blocked',error:clean(e.message,500),updatedAt:now()});writeGrowth(s);}
      outcomes.push({id,status:readGrowth().jobs.find(j=>j.id===id).status});
    }
    for(const campaign of readGrowth().campaigns.filter(c=>c.status==='active'&&new Date(c.nextRunAt)<=new Date())) {
      const date=now().slice(0,10),used=campaign.results.filter(r=>r.foundAt.slice(0,10)===date).length;
      const remaining=campaign.dailyLimit-used;
      if(remaining<=0)continue;
      const intents=['business website','services contact','local companies','service providers'];
      const query=`${campaign.niche} ${campaign.location} ${intents[campaign.queryIndex%intents.length]}`;
      let result;try {result=await search(query,{max:Math.min(5,remaining)});}catch{result={ok:false,results:[],error:'Search provider unavailable'};}
      const s=readGrowth(),c=s.campaigns.find(c=>c.id===campaign.id);if(c.status!=='active')continue;
      c.nextRunAt=new Date(Date.now()+3600000).toISOString();c.queryIndex++;c.queries.push({query,at:now(),provider:result.provider||'none'});c.queries=c.queries.slice(-100);c.lastError=result.ok?null:'Search unavailable or returned no verified candidates.';
      for(const row of (result.results||[]).slice(0,remaining)) {let url;try {url=websiteUrl(row.url).href;}catch{continue;}if(c.results.some(x=>x.url===url))continue;c.results.push({id:crypto.randomUUID(),title:clean(row.title,200),url,snippet:clean(row.snippet,1000),source:result.provider,query,foundAt:now(),status:'needs_business_verification',outreachAllowed:false});}
      c.results=c.results.slice(-1000);writeGrowth(s);
      for(const candidate of c.results.filter(r=>r.status==='needs_business_verification').slice(0,2)) {try{await verifyResearchCandidate(c.id,candidate.id,{fetchPage});}catch{ /* Keep unverified candidates explicit and retry on a later cycle. */ }}
    }
    return {outcomes};
  } finally {busy=false;}
}
export function retryGrowthJob(id) {const s=readGrowth(),j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='blocked')throw new Error('Only blocked jobs may be retried.');j.status='queued';writeGrowth(s);return j;}
export function startGrowthWorker() {if(process.env.MERIDIAN_GROWTH_WORKER!=='1')return null;
  const s=readGrowth();for(const j of s.jobs.filter(j=>j.status==='running')){j.status='blocked';j.error='Interrupted cycle; review provider acceptance before retrying to avoid duplicate work.';}writeGrowth(s);const t=setInterval(()=>runGrowthCycle().catch(e=>console.error('Growth worker stopped cycle:',e.message)),60000);t.unref();return t;}
