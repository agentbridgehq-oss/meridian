#!/usr/bin/env node
/**
 * Autonomous onboard CLI (money is human-gated unless --approve-money)
 *
 * npm run onboard -- --email a@b.com --name "Acme" --type full
 * npm run onboard -- --email a@b.com --name "Acme" --approve-money --hours "9-5" --services "HVAC"
 */

import { runOnboardPipeline } from '../lib/onboard.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) out[k] = true;
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const moneyDecision = args['approve-money'] || args.skipmoney ? 'approved' : 'pending';

const result = await runOnboardPipeline({
  email: args.email,
  businessName: args.name || args.business,
  primaryNeed: args.type || args.agent || 'full',
  niche: args.niche,
  hours: args.hours,
  services: args.services,
  faqs: args.faqs,
  bookingRules: args.booking,
  humanTransfer: args.transfer,
  tone: args.tone,
  phone: args.phone,
  moneyDecision,
  autoIntake: Boolean(args.hours || args.services || args['auto-intake']),
  source: args.source || 'cli_onboard',
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
