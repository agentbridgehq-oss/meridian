// Stripe customer portal ("Manage billing") link: env override + placement in billing notices.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_CUSTOMER_PORTAL_URL,
  customerPortalUrl,
  manageBillingLine,
  withCustomerPortalUrl,
} from '../lib/customer-portal.mjs';
import { usageAlertMessage } from '../lib/usage-alerts.mjs';

test('portal URL defaults to the Meridian Stripe portal and honours MERIDIAN_CUSTOMER_PORTAL_URL', () => {
  assert.equal(customerPortalUrl({}), DEFAULT_CUSTOMER_PORTAL_URL);
  assert.equal(customerPortalUrl({ MERIDIAN_CUSTOMER_PORTAL_URL: 'not a url' }), DEFAULT_CUSTOMER_PORTAL_URL);
  const env = { MERIDIAN_CUSTOMER_PORTAL_URL: 'https://billing.example.test/p/login/abc' };
  assert.equal(customerPortalUrl(env), env.MERIDIAN_CUSTOMER_PORTAL_URL);
  assert.equal(manageBillingLine(env), `Manage billing: ${env.MERIDIAN_CUSTOMER_PORTAL_URL}`);
  assert.equal(withCustomerPortalUrl(`<a href="${DEFAULT_CUSTOMER_PORTAL_URL}">x</a>`, env), `<a href="${env.MERIDIAN_CUSTOMER_PORTAL_URL}">x</a>`);
});

test('public pages carry the Manage billing link (footer, pricing, dashboard, intake)', () => {
  const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(index.split(`href="${DEFAULT_CUSTOMER_PORTAL_URL}"`).length - 1 >= 2, 'footer + pricing');
  for (const page of ['dashboard.html', 'intake.html']) {
    const html = fs.readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /data-portal-link>Manage billing</, page);
  }
});

test('usage alert email includes the Manage billing line', () => {
  const acc = { id: 'ba_test', periodKey: '2026-10', periodTurnsIncluded: 200, businessName: 'Test Co' };
  const msg = usageAlertMessage(acc, 'minutes', 1);
  assert.match(msg.text, /Manage billing: https:\/\//);
  assert.ok(msg.smsText.includes(customerPortalUrl()));
});
