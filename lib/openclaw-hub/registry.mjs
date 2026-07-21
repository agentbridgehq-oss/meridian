/**
 * OpenClaw agent registry — maps app → agents → expert docs + job kinds
 */

export const APP_AGENTS = {
  meridian: {
    label: 'Meridian Agency',
    agents: {
      'daily-ops': {
        title: 'Daily ops & funnel',
        expert: 'meridian/daily-ops.md',
        jobs: ['daily_brief', 'lead_progress', 'draft_outreach'],
      },
      'deploy-agent': {
        title: 'Deploy Meridian agents',
        expert: 'meridian/deploy-agent.md',
        jobs: ['deploy_agent'],
      },
      'install-pack': {
        title: 'Customer install packs',
        expert: 'meridian/install-pack.md',
        jobs: ['install_pack'],
      },
      'health-probe': {
        title: 'Synthetic health probes',
        expert: 'meridian/health-probe.md',
        jobs: ['smoke_verify'],
      },
      'sales-pipeline': {
        title: 'Sales pipeline ops',
        expert: 'meridian/sales-pipeline.md',
        jobs: ['sales_ops'],
      },
      'usage-report': {
        title: 'Usage & ROI report',
        expert: 'meridian/usage-report.md',
        jobs: ['usage_report'],
      },
    },
  },
  claudecraft: {
    label: 'ClaudeCraft',
    agents: {
      'daily-ops': {
        title: 'ClaudeCraft daily ops',
        expert: 'claudecraft/daily-ops.md',
        jobs: ['daily_brief', 'content_draft'],
      },
    },
  },
  giantbiteai: {
    label: 'GiantBiteAI',
    agents: {
      'daily-ops': {
        title: 'GiantBite daily ops',
        expert: 'giantbiteai/daily-ops.md',
        jobs: ['daily_brief', 'billing_report'],
      },
    },
  },
  agentbridge: {
    label: 'AgentBridge',
    agents: {
      'sandbox-ops': {
        title: 'Permission-gated sandbox ops',
        expert: 'agentbridge/sandbox-ops.md',
        jobs: ['sandbox_task'],
      },
    },
  },
  voxly: {
    label: 'Voxly',
    agents: {
      'daily-ops': {
        title: 'Voxly daily ops',
        expert: 'voxly/daily-ops.md',
        jobs: ['daily_brief'],
      },
    },
  },
  shared: {
    label: 'Shared',
    agents: {
      security: {
        title: 'Security officer',
        expert: 'shared/security.md',
        jobs: ['security_check'],
      },
      profitability: {
        title: 'Profitability officer',
        expert: 'shared/profitability.md',
        jobs: ['roi_check'],
      },
    },
  },
};

export function listAgents(appId) {
  const app = APP_AGENTS[appId];
  if (!app) return [];
  return Object.entries(app.agents).map(([id, meta]) => ({ id, ...meta, appId }));
}

export function getAgentMeta(appId, agentId) {
  return APP_AGENTS[appId]?.agents?.[agentId] || null;
}
