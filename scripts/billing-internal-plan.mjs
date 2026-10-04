#!/usr/bin/env node
// Idempotently give an agent an internal/demo plan in DATA_DIR/billing-accounts.json.
// Usage (on the host that owns the data volume):
//   node scripts/billing-internal-plan.mjs agent_05f24ebc02d2b04c [pro]
//   node scripts/billing-internal-plan.mjs --check +12896707853
import { ensureInternalPlan } from '../lib/internal-plans.mjs';
import { billingGateCheck } from '../lib/billing-gate-check.mjs';

const [arg, plan] = process.argv.slice(2);
if (!arg) {
  console.error('usage: billing-internal-plan.mjs <agentId> [plan] | --check <E.164 number>');
  process.exit(2);
}
const out = arg === '--check' ? billingGateCheck({ number: plan }) : ensureInternalPlan({ agentId: arg, plan: plan || undefined });
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
