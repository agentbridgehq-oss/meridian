/** Public accept/revise + ops tick for the close-loop. */
import {
  getJobByToken,
  customerRespond,
  executeJob,
  tickCloseLoop,
  closeLoopStatus,
  listCloseJobs,
  ensureCloseJobForLead,
  scoreFacts,
  autoExecuteArmed,
} from './auto-close.mjs';
import { getLead, BASE } from '../engine.mjs';

function acceptPage(job, lead, mode) {
  const name = lead?.businessName || job.businessName || 'your business';
  const p = lead?.proposal || job.proposal || {};
  const checkout = `${BASE}${p.kitCheckout || '/checkout/auto'}?lead=${lead?.id || ''}`;
  const revise = mode === 'revise';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${revise ? 'Confirm facts' : 'Accept proposal'} · Meridian</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#F7F6F3;color:#0C0C0B;margin:0;padding:32px 16px}
.w{max-width:560px;margin:0 auto}h1{font-size:1.8rem}label{display:block;margin:12px 0 4px;font-size:.85rem}
input,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;font:inherit}
button{margin-top:16px;padding:12px 18px;border:0;border-radius:999px;background:#0C0C0B;color:#fff;font-weight:600;cursor:pointer}
.muted{color:#6B6A66}.card{background:#fff;border-radius:16px;padding:20px;margin:16px 0}
</style></head><body><div class="w">
<p class="muted">Meridian Agency</p>
<h1>${revise ? 'Lock the facts before we build' : `Proposal for ${name}`}</h1>
<div class="card">
  <p>${p.summary || 'Voice + Sales + Booking agent, verified before delivery.'}</p>
  <p><strong>Setup ~$${p.setupUsd || 497}</strong> · monthly ~$${p.monthlyUsd || 197}</p>
</div>
<form id="f">
  <label>Business name</label><input name="businessName" required value="${name}">
  <label>Hours (required — real schedule)</label><input name="hours" required placeholder="Mon-Fri 8am-5pm">
  <label>Services</label><textarea name="services" required rows="3"></textarea>
  <label>Human transfer / business phone</label><input name="phone" placeholder="+1">
  <label>Website</label><input name="website" placeholder="https://">
  <label>Booking rules</label><input name="bookingRules" placeholder="Min 2 hours notice">
  <p class="muted">We will not invent prices or appointments. Smoke tests must pass or this does not go live.</p>
  <button type="submit">${revise ? 'Save facts' : 'Accept and lock facts'}</button>
</form>
<p class="muted">Payment: <a href="${checkout}">Stripe checkout</a> · money is never charged by the agent.</p>
<script>
const token = location.pathname.split('/').pop();
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const facts = Object.fromEntries(fd.entries());
  const res = await fetch('/api/close/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'accept', facts })
  });
  const data = await res.json();
  if (data.checkoutUrl && data.next === 'pay_then_execute') {
    location.href = data.checkoutUrl;
    return;
  }
  document.body.innerHTML = '<div class="w"><h1>' + (data.ok ? 'Locked' : 'Needs a fix') + '</h1><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
};
</script>
</div></body></html>`;
}

export function registerAutoCloseRoutes(app, { admin } = {}) {
  app.get('/accept/:token', (req, res) => {
    const job = getJobByToken(req.params.token);
    if (!job) return res.status(404).type('html').send('Link expired or invalid.');
    const lead = getLead(job.leadId);
    const mode = req.query.mode === 'revise' || job.reviseToken === req.params.token ? 'revise' : 'accept';
    res.type('html').send(acceptPage(job, lead, mode));
  });

  app.post('/api/close/respond', async (req, res) => {
    try {
      const out = await customerRespond({
        token: req.body?.token || req.query?.token,
        action: req.body?.action,
        facts: req.body?.facts,
        message: req.body?.message,
      });
      res.status(out.ok ? 200 : 400).json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/close/score', (req, res) => {
    res.json(scoreFacts(req.body?.facts || req.body || {}));
  });

  app.get('/api/close/status', (_req, res) => {
    res.json({ ok: true, armed: autoExecuteArmed(), public: true });
  });

  app.get('/api/ops/close/status', (req, res) => {
    if (typeof admin === 'function' && !admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ ok: true, ...closeLoopStatus() });
  });

  app.get('/api/ops/close/jobs', (req, res) => {
    if (typeof admin === 'function' && !admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ ok: true, jobs: listCloseJobs(80) });
  });

  app.post('/api/ops/close/open/:leadId', (req, res) => {
    if (typeof admin === 'function' && !admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json(ensureCloseJobForLead(req.params.leadId));
  });

  app.post('/api/ops/close/execute/:jobId', async (req, res) => {
    if (typeof admin === 'function' && !admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      res.json(await executeJob(req.params.jobId));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/ops/close/tick', async (req, res) => {
    if (typeof admin === 'function' && !admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      res.json(await tickCloseLoop({ max: Number(req.body?.max) || 5 }));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
