#!/usr/bin/env node
/**
 * Launch acceptance report. Prints booleans only. Never prints secrets.
 * Code checks run with no network. Pass --url to probe a deployed origin.
 *
 *   node scripts/launch-acceptance.mjs
 *   node scripts/launch-acceptance.mjs --url https://meridian-production-4996.up.railway.app
 */
import { readFileSync } from 'node:fs';
import { SMS_START, SMS_STOP, spokenDisclosure } from '../lib/compliance.mjs';

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const base = (urlFlag >= 0 ? String(args[urlFlag + 1] || '') : '').trim().replace(/\/$/, '');

function read(rel) {
  return readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
}

const disclosure = spokenDisclosure('Sample Business');
const privacy = read('public/privacy.html');
const terms = read('public/terms.html');
const contact = read('public/contact.html');
const channel = read('lib/twilio-channel.mjs');

const code = [
  { id: 'disclosure_phrase', ok: disclosure.startsWith("You are speaking with Sample Business's AI assistant.") && disclosure.includes('This call may be recorded for quality, training, and customer support.') },
  { id: 'sms_stop_start', ok: SMS_STOP.includes('Reply START') && SMS_START.startsWith("You're opted in.") },
  { id: 'fallback_phrase', ok: channel.includes('Our virtual receptionist is not available right now.') },
  { id: 'privacy_recording', ok: privacy.includes('call may be recorded') && privacy.includes('AI assistant') },
  { id: 'terms_ai_calls', ok: terms.includes('AI call handling') && terms.includes('must not claim to be human') },
  { id: 'contact_page', ok: contact.includes('three business days') && contact.includes('not published yet') },
  { id: 'legal_not_silently_approved', ok: privacy.includes('pending owner legal approval') && terms.includes('pending owner approval') },
];

const expect = {
  '/healthz': /"ok"\s*:\s*true/,
  '/api/twilio/status': /"webhookTokenSet"/,
  '/api/voice-demo/status': /"enabled"/,
  '/privacy': /call may be recorded for quality, training, and customer support/,
  '/terms': /AI call handling/,
  '/contact': /Monitored mailbox/,
};

async function probe(pathname) {
  try {
    const res = await fetch(base + pathname, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    const body = await res.text();
    const leaked = /(?:sk_live|whsec_|AC[0-9a-f]{32}|OPS_TOKEN=|TWILIO_AUTH_TOKEN=)/i.test(body);
    const marker = expect[pathname] ? expect[pathname].test(body) : true;
    return { path: pathname, status: res.status, ok: res.status >= 200 && res.status < 300 && !leaked && marker, leaked, marker };
  } catch (err) {
    return { path: pathname, status: 0, ok: false, error: err.message };
  }
}

const probes = [];
if (base) {
  for (const path of ['/healthz', '/api/twilio/status', '/api/voice-demo/status', '/privacy', '/terms', '/contact']) {
    probes.push(await probe(path));
  }
}

const codeOk = code.every((row) => row.ok);
const liveOk = !base || probes.every((row) => row.ok);
const out = {
  ok: codeOk && liveOk,
  generatedAt: new Date().toISOString(),
  publicBaseUrl: base || null,
  code,
  probes,
  ownerStillRequired: [
    'Call the live number and confirm the first spoken line matches the fixed disclosure.',
    'Text STOP, START, HELP, and one normal message to the business number.',
    'Confirm the human transfer number actually rings.',
    'Book one real appointment and see it on the connected calendar.',
    'Create and monitor a dedicated support mailbox, then publish that address.',
    'Approve privacy, terms, and DPA, plus SLA, turnaround, guarantee, and Rescue scope.',
    'Point +1 647-490-3326 voice and SMS webhooks only after the disclosure build is deployed. Leave +1 289-670-7853 demo route intact until you confirm which number you tested.',
    'Redeploy Railway from meridian-agency-2-0 only when you explicitly approve the deploy. This script does not deploy.',
  ],
  launch: 'NO-GO until ownerStillRequired is done. A green code check is not a customer launch.',
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
if (!out.ok) process.exitCode = 1;
