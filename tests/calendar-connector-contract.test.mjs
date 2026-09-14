import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_ACTIONS,
  assertCalendarConfirmable,
  calendarDenied,
  calendarSuccess,
  isSupportedCalendarAction,
  meridianCalendarPayload,
  signMeridianPayload,
  verifyMeridianCalendarRequest,
} from '../lib/calendar-connector-contract.mjs';

test('calendar contract accepts only the four receptionist actions', () => {
  assert.deepEqual(CALENDAR_ACTIONS, [
    'check_availability',
    'book_appointment',
    'cancel_appointment',
    'reschedule_appointment',
  ]);
  assert.equal(isSupportedCalendarAction('book_appointment'), true);
  assert.equal(isSupportedCalendarAction('invent_slot'), false);
});

test('success payload is confirmable and denied payload is not', () => {
  const ok = calendarSuccess({
    action: 'check_availability',
    available: true,
    slots: [{ start: '2026-09-15T14:00:00-04:00', end: '2026-09-15T15:00:00-04:00', label: 'Tue 2:00 PM' }],
  });
  assert.equal(assertCalendarConfirmable(ok), true);
  assert.equal(ok.slots[0].start.startsWith('2026-09-15'), true);
  assert.equal(assertCalendarConfirmable(calendarDenied('slot_not_confirmed', 'Caller must confirm the slot.')), false);
  assert.equal(assertCalendarConfirmable({ ok: true, bookingId: 'evt_1' }), false);
});

test('signed payload verifies by bearer or matching hmac', () => {
  const secret = 'test-secret-value-12345';
  const payload = meridianCalendarPayload({
    action: 'book_appointment',
    deploymentId: 'dep_abc',
    projectId: 'lead_1',
    businessName: 'Test HVAC',
    idempotencyKey: 'idem_1',
    data: { startTime: '2026-09-15T14:00:00-04:00', callerConfirmedSlot: true },
  });
  const raw = JSON.stringify(payload);
  const hmac = verifyMeridianCalendarRequest({
    rawBody: raw,
    signatureHeader: signMeridianPayload(raw, secret),
    bearerHeader: '',
    secret,
  });
  assert.equal(hmac.ok, true);
  assert.equal(hmac.method, 'hmac');
  const bearer = verifyMeridianCalendarRequest({
    rawBody: raw,
    signatureHeader: '',
    bearerHeader: `Bearer ${secret}`,
    secret,
  });
  assert.equal(bearer.ok, true);
  assert.equal(bearer.method, 'bearer');
  const bad = verifyMeridianCalendarRequest({
    rawBody: raw,
    signatureHeader: 'sha256=deadbeef',
    bearerHeader: 'Bearer wrong',
    secret,
  });
  assert.equal(bad.ok, false);
});
