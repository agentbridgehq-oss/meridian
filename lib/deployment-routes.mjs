import { getLead } from '../engine.mjs';
import { provisionManagedRuntime } from './managed-runtime.mjs';
import {
  activateDeployment,
  createDeploymentFromAgencyLead,
  deploymentSummary,
  getDeployment,
  listDeployments,
  pauseDeployment,
  recordAcceptanceCheck,
  recordClientAcceptance,
  recordHealth,
  recordRollbackPlan,
  updateDeploymentConfig,
  updateIntegration,
} from './deployment-core.mjs';

function revision(req) {
  const value = req.get('If-Match') || req.body?.revision;
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(/^W\//, '').replace(/"/g, '');
  const n = Number(normalized);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sendResult(res, result, successStatus = 200) {
  if (!result?.ok) {
    return res.status(result?.status || 400).json({
      ok: false,
      error: result?.error || 'Deployment operation failed',
      ...(result?.blockers ? { blockers: result.blockers } : {}),
      ...(result?.revision ? { revision: result.revision } : {}),
    });
  }
  res.set('ETag', `"${result.deployment.revision}"`);
  return res.status(successStatus).json({
    ok: true,
    deployment: result.deployment,
    summary: deploymentSummary(result.deployment),
    ...(result.created !== undefined ? { created: result.created } : {}),
  });
}

export function registerDeploymentCoreRoutes(app, { admin }) {
  app.get('/api/ops/deployments', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const deployments = listDeployments();
    return res.json({
      ok: true,
      deployments: deployments.map(deploymentSummary),
      counts: deployments.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}),
    });
  });

  app.post('/api/ops/deployments/from-project/:projectId', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const lead = getLead(req.params.projectId);
    if (!lead?.agency) return res.status(404).json({ error: 'Agency project not found' });
    if (lead.agency.proposal?.status !== 'approved')
      return res.status(409).json({ error: 'Commercial scope must be approved before deployment provisioning.' });
    return sendResult(res, createDeploymentFromAgencyLead(lead), 201);
  });

  app.get('/api/ops/deployments/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const deployment = getDeployment(req.params.id);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
    res.set('ETag', `"${deployment.revision}"`);
    return res.json({ ok: true, deployment, summary: deploymentSummary(deployment) });
  });

  app.post('/api/ops/deployments/:id/provision-runtime', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const result = provisionManagedRuntime(req.params.id);
    if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
    const deployment = getDeployment(req.params.id);
    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: result.created,
      runtime: result.runtime,
      ...(result.oneTimeSecret ? { oneTimeSecret: result.oneTimeSecret } : {}),
      ...(result.note ? { note: result.note } : {}),
      deployment: deploymentSummary(deployment),
    });
  });

  app.patch('/api/ops/deployments/:id/config', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, updateDeploymentConfig(req.params.id, req.body || {}, revision(req)));
  });

  app.patch('/api/ops/deployments/:id/integrations/:kind', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, updateIntegration(req.params.id, req.params.kind, req.body || {}, revision(req)));
  });

  app.patch('/api/ops/deployments/:id/checks/:checkId', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, recordAcceptanceCheck(req.params.id, req.params.checkId, req.body || {}, revision(req)));
  });

  app.put('/api/ops/deployments/:id/rollback', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, recordRollbackPlan(req.params.id, req.body || {}, revision(req)));
  });

  app.put('/api/ops/deployments/:id/acceptance', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, recordClientAcceptance(req.params.id, req.body || {}, revision(req)));
  });

  app.put('/api/ops/deployments/:id/health', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, recordHealth(req.params.id, req.body || {}, revision(req)));
  });

  app.post('/api/ops/deployments/:id/activate', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, activateDeployment(req.params.id, req.body || {}, revision(req)));
  });

  app.post('/api/ops/deployments/:id/pause', (req, res) => {
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    return sendResult(res, pauseDeployment(req.params.id, req.body || {}, revision(req)));
  });
}
