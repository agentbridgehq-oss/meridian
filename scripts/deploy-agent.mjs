#!/usr/bin/env node
/**
 * CLI: deploy Meridian agents automatically
 *
 * Usage:
 *   node scripts/deploy-agent.mjs --email a@b.com --name "Acme HVAC" --type full
 *   node scripts/deploy-agent.mjs --config deploy/examples/hvac.json
 *   npm run deploy:agent -- --type voice --name "Demo Voice"
 *
 * Env:
 *   PUBLIC_BASE_URL  (default http://localhost:8891)
 *   DATA_DIR
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deployAgent, listDeployTemplates } from '../lib/deploy-agent.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

async function deployRemote(input, remoteBase, token) {
  const base = remoteBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/ops/deploy-agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...input, baseUrl: base, source: input.source || 'cli-remote' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || res.statusText, status: res.status };
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(`Meridian auto-deploy

Templates: ${listDeployTemplates().map((t) => t.id).join(', ')}

Flags:
  --email       Client email
  --name        Business name
  --type        voice | sales | booking | full  (default full)
  --niche       Industry
  --hours --services --faqs --booking --transfer --tone --phone --website
  --config      Path to JSON config (overrides flags)
  --source      Label for audit (default cli)
  --base        Base URL for endpoint strings (local default http://localhost:8891)
  --remote      Deploy on live Meridian via API (requires OPS_TOKEN)
  --url         Remote base (default https://meridian-production-2eb0.up.railway.app)
  --token       OPS_TOKEN (or env OPS_TOKEN)
  --json        Print full JSON (includes apiKey once)
`);
    process.exit(0);
  }

  let input = {
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
    website: args.website,
    source: args.source || 'cli',
  };

  if (args.config) {
    const p = path.resolve(args.config);
    const file = JSON.parse(fs.readFileSync(p, 'utf8'));
    input = { ...input, ...file, source: file.source || input.source };
  }

  if (!input.email) {
    input.email = `auto+${Date.now()}@deploy.meridian.local`;
  }

  let result;
  if (args.remote) {
    const token = args.token || process.env.OPS_TOKEN || '';
    if (!token) {
      console.error('Remote deploy needs --token or OPS_TOKEN');
      process.exit(1);
    }
    const remoteBase =
      args.url || process.env.MERIDIAN_REMOTE_URL || 'https://meridian-production-2eb0.up.railway.app';
    result = await deployRemote(input, remoteBase, token);
  } else {
    // Local engine data → endpoints must point at local server, not production
    input.baseUrl = args.base || process.env.PUBLIC_BASE_URL || 'http://localhost:8891';
    if (/railway\.app/i.test(input.baseUrl) && !args.base) {
      input.baseUrl = 'http://localhost:8891';
    }
    result = await deployAgent(input);
  }

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n  MERIDIAN AUTO-DEPLOY OK`);
    console.log(`  Business:  ${result.businessName}`);
    console.log(`  Type:      ${result.agentType}`);
    console.log(`  Agent ID:  ${result.agentId}`);
    console.log(`  API Key:   ${result.apiKey}`);
    console.log(`  VoiceTurn: ${result.endpoints?.voiceTurn}`);
    console.log(`  Artifacts: ${result.artifactDir || '(remote — check server DATA_DIR/deploys)'}`);
    console.log(`\n  Smoke:`);
    (result.smoke || []).forEach((c) => console.log(`  ${c}`));
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
