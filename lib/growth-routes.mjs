import { createOpportunity, issueOpportunityQuote, approveOpportunity, readGrowth, enqueueGrowth, runGrowthCycle, createResearchCampaign, setResearchCampaign, retryGrowthJob, saveOfferTemplate, verifyResearchCandidate, configureContinuousReview, startGrowthWorker } from './growth-engine.mjs';
import rateLimit from 'express-rate-limit';
import { getLead, upsertLead } from '../engine.mjs';
export function registerGrowthRoutes(app,{admin,publicLimiter,rejectObviousBots,checkFormBot,projectFor,publicProject}) {
  app.use(['/api/opportunities','/api/ops/growth'],(_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
  const analysisLimiter=rateLimit({windowMs:3600000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Free scan limit reached. Please try again later.'}});
  let analyzing=0;
  app.post('/api/opportunities/analyze',publicLimiter,analysisLimiter,rejectObviousBots,async(req,res)=>{
    if(!checkFormBot(req.body||{}).ok)return res.status(400).json({error:'Please wait a moment and try again.'});
    if(analyzing>=3)return res.status(503).json({error:'The analyzer is busy. Your inputs are preserved; retry shortly.'});
    analyzing++;
    try {const lead=await createOpportunity(req.body||{});res.status(201).json({ok:true,project:publicProject(lead),onboardingPath:`/meridian-onboarding.html#${lead.agency.token}`,emailStatus:'queued; provider acceptance not yet verified'});}catch(e){res.status(400).json({error:e.message});}finally{analyzing--;}
  });
  app.post('/api/opportunities/request-offer',publicLimiter,(req,res)=>{
    const lead=projectFor(req);if(!lead?.agency.analysis)return res.status(401).json({error:'Open your private report link.'});
    if(!['foundation','growth','scale'].includes(req.body?.tier))return res.status(400).json({error:'Choose an engagement.'});
    if(lead.agency.proposal.status==='approved')return res.status(409).json({error:'Your scope is already approved.'});
    upsertLead({id:lead.id,agency:{...lead.agency,offerRequest:{tier:req.body.tier,requestedAt:new Date().toISOString()}}});
    const template=(readGrowth().templates||[]).find(t=>t.enabled&&t.service===lead.agency.proposal.service&&t.tier===req.body.tier);
    if(template){const offered=issueOpportunityQuote(lead.id,template);return res.json({ok:true,project:publicProject(offered),message:'Your offer is ready. Refresh your project to review the written scope and fees.'});}
    res.json({ok:true,message:'Offer request saved. Meridian will confirm the final scope, fees, timing and provider costs.'});
  });
  app.post('/api/opportunities/approve',publicLimiter,(req,res)=>{
    const lead=projectFor(req);if(!lead?.agency.analysis)return res.status(401).json({error:'Open your private report link.'});
    try {res.json({ok:true,project:publicProject(approveOpportunity(lead,req.body||{}))});}catch(e){res.status(409).json({error:e.message});}
  });
  app.use('/api/ops/growth',(req,res,next)=>admin(req)?next():res.status(401).json({error:'Unauthorized'}));
  app.get('/api/ops/growth',(_req,res)=>res.json({ok:true,...readGrowth(),workerEnabled:process.env.MERIDIAN_GROWTH_WORKER==='1',searchProviderConfigured:Boolean(process.env.BRAVE_API_KEY||process.env.SERPER_API_KEY),emailConfigured:Boolean(process.env.RESEND_API_KEY),execution:'Approved delivery preparation; production activation uses existing verified deployment gates.'}));
  app.post('/api/ops/growth/templates',(req,res)=>{try{res.json({ok:true,template:saveOfferTemplate(req.body||{})});}catch(e){res.status(400).json({error:e.message});}});
  app.post('/api/ops/growth/projects/:id/offer',(req,res)=>{try{res.json({ok:true,project:publicProject(issueOpportunityQuote(req.params.id,req.body||{}))});}catch(e){res.status(400).json({error:e.message});}});
  app.post('/api/ops/growth/projects/:id/design',(req,res)=>{
    const lead=getLead(req.params.id),b=req.body||{};
    if(!lead?.agency?.analysis||lead.agency.proposal.status!=='approved'||!lead.agency.intake||!['intake','access','design'].includes(lead.agency.stage)||b.accessVerified!==true||b.designApproved!==true||typeof b.evidence!=='string'||b.evidence.trim().length<12)return res.status(409).json({error:'Complete approved intake, verify scoped access and record the customer-approved design evidence first.'});
    upsertLead({id:lead.id,agency:{...lead.agency,stage:'design',designApproved:true,history:[...lead.agency.history,{stage:'design',at:new Date().toISOString(),evidence:b.evidence.trim().slice(0,4000)}]}});
    res.json({ok:true,job:enqueueGrowth('deployment-prepare',lead.id)});
  });
  app.post('/api/ops/growth/projects/:id/operations',(req,res)=>{try{res.json({ok:true,project:publicProject(configureContinuousReview(req.params.id,req.body||{}))})}catch(e){res.status(409).json({error:e.message})}});
  app.post('/api/ops/growth/campaigns/:id/candidates/:candidateId/verify',async(req,res)=>{try{res.json({ok:true,candidate:await verifyResearchCandidate(req.params.id,req.params.candidateId)})}catch{res.status(400).json({error:'Candidate website could not be verified. No outreach enabled.'})}});
  app.post('/api/ops/growth/campaigns',(req,res)=>{try{res.status(201).json({ok:true,campaign:createResearchCampaign(req.body||{})});}catch(e){res.status(400).json({error:e.message});}});
  app.patch('/api/ops/growth/campaigns/:id',(req,res)=>{if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Provide enabled:true or enabled:false.'});try{res.json({ok:true,campaign:setResearchCampaign(req.params.id,req.body.enabled)});}catch(e){res.status(404).json({error:e.message});}});
  app.post('/api/ops/growth/jobs/:id/retry',(req,res)=>{try{res.json({ok:true,job:retryGrowthJob(req.params.id)});}catch(e){res.status(409).json({error:e.message});}});
  app.post('/api/ops/growth/run',async(_req,res)=>{try{res.json({ok:true,...await runGrowthCycle()});}catch{res.status(503).json({error:'Growth data or providers unavailable. Review the worker state.'});}});
  startGrowthWorker();
}
