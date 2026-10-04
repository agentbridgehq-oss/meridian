/**
 * Internal / demo billing plans (no Stripe, no revenue) so Meridian's own agents pass
 * the fail-safe billing gate that every live channel enforces after the billing restore.
 *
 * Why: lib/usage-meter.mjs refuses AI for any agent without a mapped billing account
 * on an active plan (or prepaid balance). Production 157f9b6 had no gate, so the demo
 * agent (agent_05f24ebc02d2b04c on +1 289-670-7853) has never needed one. Without a seed
 * it would be refused on the first call after deploy.
 *
 * Seeding is idempotent and never touches a paid account:
 *   - no account for the agent  → create one, activate the internal plan
 *   - internal plan already on  → no-op (usage this month is kept)
 *   - account has a Stripe subscription / paid active plan → left alone
 * Internal accounts still enforce the plan caps (stop at cap; no card → no PAYG), so a
 * public demo number cannot run up unbounded xAI cost. They count as CA$0 revenue in the
 * owner AI-cost alert.
 *
 * Ways to apply (pick one):
 *   1. Env (recommended, runs on every boot, idempotent):
 *        MERIDIAN_INTERNAL_AGENT_IDS=agent_05f24ebc02d2b04c:pro
 *   2. Admin API:  POST /api/ops/billing/internal-plan {"agentId":"agent_…","plan":"pro"}
 *   3. CLI on the server volume:  node scripts/billing-internal-plan.mjs agent_… pro
 */
import {
  activateSubscription,
  ensureBillingAccount,
  getBillingByAgent,
  planIdFor,
  updateBillingAccount,
  usageState,
} from './usage-billing.mjs';

export const INTERNAL_PLAN_DEFAULT = 'pro'; // 600 AI min + SMS per month; worst case ≈ CA$158 vendor cost

/** Parse "agent_a:pro, agent_b" → [{agentId, plan}] (invalid ids are ignored). */
export function parseInternalAgents(value = '') {
  return String(value || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [agentId, plan] = entry.split(':');
      return { agentId: agentId.trim(), plan: (plan || INTERNAL_PLAN_DEFAULT).trim() };
    })
    .filter((x) => /^agent_[A-Za-z0-9_-]{4,64}$/.test(x.agentId));
}

/** Idempotently give an agent an internal (CA$0, no-Stripe) plan. */
export function ensureInternalPlan({ agentId, plan = INTERNAL_PLAN_DEFAULT, reason = 'internal demo agent', businessName = '' } = {}) {
  if (!/^agent_[A-Za-z0-9_-]{4,64}$/.test(String(agentId || ''))) return { ok: false, error: 'invalid_agent_id' };
  const planId = planIdFor(plan);
  if (!planId) return { ok: false, error: 'unknown_plan' };
  let acc = getBillingByAgent(agentId);
  const created = !acc;
  if (!acc) acc = ensureBillingAccount({ agentId, businessName });
  const st = usageState(acc);
  if (!acc.internal && (acc.stripeSubscriptionId || st.active)) {
    return { ok: true, changed: false, reason: 'paid_plan_present', accountId: acc.id, plan: st.planId };
  }
  if (acc.internal && st.active && st.planId === planId) {
    return { ok: true, changed: false, reason: 'already_internal', accountId: acc.id, plan: planId };
  }
  const r = activateSubscription(acc.id, planId, { internal: true, amountCents: 0 });
  if (!r.ok) return { ok: false, error: r.error, accountId: acc.id };
  updateBillingAccount(acc.id, { internal: true, internalReason: String(reason).slice(0, 200), internalSince: acc.internalSince || new Date().toISOString() });
  return { ok: true, changed: true, created, accountId: acc.id, plan: planId };
}

/** Boot-time seed from MERIDIAN_INTERNAL_AGENT_IDS. Never throws. */
export function seedInternalAgentsFromEnv(env = process.env, log = console) {
  const results = [];
  for (const { agentId, plan } of parseInternalAgents(env.MERIDIAN_INTERNAL_AGENT_IDS)) {
    try {
      const r = ensureInternalPlan({ agentId, plan });
      results.push({ agentId, ...r });
      log?.log?.(`  Internal plan: ${agentId} → ${r.ok ? `${r.plan || plan} (${r.changed ? 'applied' : r.reason})` : `FAILED ${r.error}`}`);
    } catch (e) {
      results.push({ agentId, ok: false, error: e.message });
    }
  }
  return results;
}
