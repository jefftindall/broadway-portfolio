/**
 * Azure Communication Services email + SMS for contact inquiries.
 */
import { EmailClient } from '@azure/communication-email';
import { SmsClient } from '@azure/communication-sms';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value || value === 'REPLACE_ME') {
    const err = new Error(`Missing ${name}`);
    err.name = 'ContactConfigError';
    throw err;
  }
  return value;
}

/**
 * @param {{
 *   type: 'casting' | 'lesson',
 *   name: string,
 *   preferredContact: 'email' | 'phone',
 *   email?: string,
 *   phone?: string,
 *   organization?: string,
 *   format?: 'nyc' | 'zoom',
 *   message: string,
 *   correlationId: string,
 * }} inquiry
 */
export async function sendInquiryEmail(inquiry) {
  const connectionString = requireEnv('ACS_CONNECTION_STRING');
  const sender = requireEnv('ACS_EMAIL_SENDER');
  const to = requireEnv('CONTACT_NOTIFY_EMAIL');

  const subject =
    inquiry.type === 'casting' ? 'Casting Inquiry' : 'Lesson Inquiry';

  const lines = [
    `Type: ${inquiry.type}`,
    `Name: ${inquiry.name}`,
    `Preferred contact: ${inquiry.preferredContact === 'email' ? 'Email' : 'Phone'}`,
    inquiry.email ? `Email: ${inquiry.email}` : null,
    inquiry.phone ? `Phone: ${inquiry.phone}` : null,
    inquiry.organization ? `Organization: ${inquiry.organization}` : null,
    inquiry.format
      ? `Format: ${inquiry.format === 'nyc' ? 'NYC in-person' : 'Zoom'}`
      : null,
    '',
    'Message:',
    inquiry.message,
    '',
    `Reference: ${inquiry.correlationId}`,
  ].filter((line) => line !== null);

  const plainText = lines.join('\n');
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(
    plainText,
  )}</pre>`;

  const payload = {
    senderAddress: sender,
    recipients: {
      to: [{ address: to }],
    },
    content: {
      subject,
      plainText,
      html,
    },
  };
  if (inquiry.email) {
    payload.replyTo = [{ address: inquiry.email, displayName: inquiry.name }];
  }

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend(payload);

  const result = await poller.pollUntilDone();
  if (result.status !== 'Succeeded') {
    const err = new Error(`ACS email status: ${result.status}`);
    err.name = 'ContactAcsError';
    throw err;
  }
}

/**
 * @param {{ type: 'casting' | 'lesson', name: string }} inquiry
 * @returns {Promise<boolean>} true if SMS sent
 */
export async function sendInquirySms(inquiry) {
  const enabled = String(process.env.CONTACT_SMS_ENABLED || '')
    .trim()
    .toLowerCase();
  if (enabled !== 'true' && enabled !== '1') {
    return false;
  }

  const from = String(process.env.ACS_SMS_FROM || '').trim();
  const to = String(process.env.CONTACT_NOTIFY_PHONE || '').trim();
  if (!from || from === 'REPLACE_ME' || !to || to === 'REPLACE_ME') {
    return false;
  }

  const connectionString = requireEnv('ACS_CONNECTION_STRING');
  const label = inquiry.type === 'casting' ? 'casting' : 'lesson';
  const message = `New ${label} inquiry from ${inquiry.name}. Check email for details.`;

  const client = new SmsClient(connectionString);
  const results = await client.send({
    from,
    to: [normalizeE164(to)],
    message,
  });

  const first = results?.[0];
  if (first && first.successful === false) {
    const err = new Error(first.errorMessage || 'ACS SMS send failed');
    err.name = 'ContactAcsError';
    throw err;
  }
  return true;
}

function normalizeE164(phone) {
  const trimmed = phone.replace(/[\s().-]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d{10}$/.test(trimmed)) return `+1${trimmed}`;
  if (/^1\d{10}$/.test(trimmed)) return `+${trimmed}`;
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
