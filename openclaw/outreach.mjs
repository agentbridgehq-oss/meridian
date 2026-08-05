#!/usr/bin/env node
/**
 * CLI: review, approve, and (gated) send Meridian CASL cold-outreach drafts.
 *
 * Usage:
 *   node openclaw/outreach.mjs --list
 *   node openclaw/outreach.mjs --process                       # draft from data/outreach-queue.json
 *   node openclaw/outreach.mjs --approve <draftId>
 *   node openclaw/outreach.mjs --unsub someone@example.com
 *   node openclaw/outreach.mjs --send --confirm APPROVED_SEND   # requires MERIDIAN_OUTREACH_SEND=1
 *   npm run openclaw:outreach -- --list
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { listOutreachDrafts, approveOutreach } from '../engine.mjs';
import {
  outreachCaslStatus,
  processOutreachQueue,
  addUnsub,
  sendApprovedOutreach,
} from '../lib/outreach-casl.mjs';

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h || (!args.list && !args.process && !args.approve && !args.unsub && !args.send)) {
    console.log(`Meridian CASL outreach

Flags:
  --list                     Show status + all drafts (pending / approved / sent)
  --process                  Draft from data/outreach-queue.json (never sends)
  --approve <draftId>        Mark a draft approved_send=true (still requires --send after)
  --unsub <email>            Permanently block outreach to this email
  --send --confirm APPROVED_SEND [--max N]
                             Send approved-unsent drafts. Requires MERIDIAN_OUTREACH_SEND=1 on the server.
`);
    return;
  }

  if (args.process) {
    const result = await processOutreachQueue({ max: Number(args.max) || 15 });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.approve) {
    const draft = approveOutreach(String(args.approve));
    if (!draft) {
      console.error(`No draft found with id ${args.approve}`);
      process.exit(1);
    }
    console.log(`Approved ${draft.id} → ${draft.to} (still needs --send --confirm APPROVED_SEND to actually go out)`);
    return;
  }

  if (args.unsub) {
    const result = addUnsub(String(args.unsub));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.send) {
    const result = await sendApprovedOutreach({
      confirm: args.confirm,
      max: Number(args.max) || 5,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  // --list (default)
  const status = outreachCaslStatus();
  const drafts = listOutreachDrafts();
  console.log('=== Meridian CASL Outreach Status ===');
  console.log(JSON.stringify(status, null, 2));
  console.log(`\n=== Drafts (${drafts.length}) ===`);
  for (const d of drafts) {
    const state = d.sentAt ? 'SENT' : d.approved_send ? 'APPROVED (unsent)' : 'PENDING';
    console.log(`- [${state}] ${d.id} → ${d.to} · ${d.subject}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
