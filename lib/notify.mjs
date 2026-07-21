/**
 * Owner notifications: email (Resend) + optional SMS (Twilio).
 * Never throws — all soft-fail for customer path reliability.
 */

const RESEND_URL = 'https://api.resend.com/emails';

export function notifyConfig() {
  return {
    email: Boolean(process.env.RESEND_API_KEY?.trim()),
    sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    fromEmail: process.env.EMAIL_FROM || 'Meridian <onboarding@resend.dev>',
  };
}

export async function sendOwnerEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !to) return { ok: false, skipped: true, reason: !key ? 'no_resend' : 'no_to' };
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Meridian <onboarding@resend.dev>',
        to: [String(to).trim()],
        subject: String(subject || 'Meridian alert').slice(0, 200),
        text: String(text || '').slice(0, 8000),
        html: html || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { ok: false, error: String(err).slice(0, 300) };
    }
    return { ok: true, channel: 'email' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Twilio SMS — optional. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 */
export async function sendSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const dest = String(to || '').replace(/[^\d+]/g, '');
  if (!sid || !token || !from || !dest) {
    return { ok: false, skipped: true, reason: 'sms_not_configured' };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({
      To: dest.startsWith('+') ? dest : `+${dest}`,
      From: from,
      Body: String(body || '').slice(0, 1400),
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { ok: false, error: String(err).slice(0, 300) };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, channel: 'sms', sid: data.sid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Notify business owner about high-priority events.
 */
export async function notifyOwner(agent, { subject, text, smsText, forceSms = false } = {}) {
  const cfg = agent?.config || {};
  const email = cfg.ownerNotifyEmail || cfg.notifyEmail || '';
  const phone = cfg.ownerNotifyPhone || cfg.notifyPhone || '';
  const results = { email: null, sms: null };

  if (email) {
    results.email = await sendOwnerEmail({
      to: email,
      subject: subject || `Meridian · ${agent.businessName || 'Agent'}`,
      text: text || '',
    });
  } else {
    results.email = { ok: false, skipped: true, reason: 'no_owner_email' };
  }

  if (phone && (forceSms || process.env.MERIDIAN_SMS_ALERTS === '1')) {
    results.sms = await sendSms({
      to: phone,
      body: smsText || text?.slice(0, 300) || subject,
    });
  } else {
    results.sms = { ok: false, skipped: true, reason: phone ? 'sms_alerts_off' : 'no_owner_phone' };
  }

  return {
    ok: Boolean(results.email?.ok || results.sms?.ok),
    results,
  };
}

/**
 * Post-call / post-chat structured summary to owner + optional customer SMS.
 */
export async function sendInteractionSummary(agent, interaction, { customerPhone } = {}) {
  const name = agent?.businessName || 'Your business';
  const intent = interaction?.intent || {};
  const subject = intent.emergency
    ? `🚨 Emergency call · ${name}`
    : intent.transferSuggested
      ? `⚠ Transfer requested · ${name}`
      : intent.booking
        ? `📅 Booking interest · ${name}`
        : `Meridian summary · ${name}`;

  const text = [
    `Channel: ${interaction.channel || 'chat'}`,
    `Time: ${interaction.at || new Date().toISOString()}`,
    intent.priority ? `Priority: ${intent.priority}` : '',
    '',
    `Caller/visitor said:`,
    interaction.message || '(empty)',
    '',
    `Agent replied:`,
    interaction.reply || '(empty)',
    '',
    intent.emergency ? 'ACTION: Treat as emergency — call them back immediately.' : '',
    intent.transferSuggested && !intent.emergency ? 'ACTION: Consider calling back / human follow-up.' : '',
    agent?.config?.humanTransfer ? `Human transfer #: ${agent.config.humanTransfer}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const owner = await notifyOwner(agent, {
    subject,
    text,
    smsText: `${subject}: "${(interaction.message || '').slice(0, 100)}"`,
    forceSms: Boolean(intent.emergency || intent.frustrated),
  });

  let customerSms = null;
  if (customerPhone && agent?.config?.smsConfirmEnabled !== false) {
    const confirm =
      agent.config?.smsConfirmTemplate ||
      `Thanks for contacting ${name}. We received your message and will follow up soon. Reply STOP to opt out.`;
    customerSms = await sendSms({ to: customerPhone, body: confirm });
  }

  return { ok: owner.ok || Boolean(customerSms?.ok), owner, customerSms };
}

/**
 * Missed-call text-back template.
 */
export async function sendMissedCallTextBack(agent, { to, name } = {}) {
  const biz = agent?.businessName || 'us';
  const body =
    agent?.config?.missedCallSms ||
    `Hi${name ? ` ${name}` : ''} — sorry we missed your call to ${biz}. Reply here or call back anytime. We can help with hours, booking, or questions.`;
  return sendSms({ to, body });
}
