import { getDeployment } from './deployment-core.mjs';
import { businessAdapterStatus, connectorSecretEnvName } from './business-system-adapter.mjs';

export function registerBusinessSystemRoutes(app, { admin } = {}) {
  app.get('/api/ops/deployments/:id/business-connectors', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin?.(req)) return res.status(401).json({ error: 'Unauthorized' });
    const deployment = getDeployment(req.params.id);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
    const connectors = {};
    for (const kind of ['crm','calendar']) {
      const integration = deployment.integrations?.[kind];
      if (!integration) continue;
      const status = businessAdapterStatus(deployment, kind);
      connectors[kind] = {
        provider: integration.provider || null,
        verificationStatus: integration.status,
        credentialConfigured: integration.credentialConfigured === true,
        endpointConfigured: Boolean(integration.endpoint),
        adapterReady: status.ready === true,
        blocker: status.ready ? null : status.reason,
        requiredSecretEnv: connectorSecretEnvName(deployment.id, kind),
        secretConfiguredAtRuntime: status.secretConfigured === true,
      };
    }
    return res.json({ ok: true, deploymentId: deployment.id, connectors });
  });
}
