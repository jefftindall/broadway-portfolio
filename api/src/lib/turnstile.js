/**
 * Cloudflare Turnstile server-side verification.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

/**
 * @param {string} token
 * @param {string} [remoteIp]
 * @returns {Promise<void>}
 */
export async function verifyTurnstile(token, remoteIp) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret || secret === 'REPLACE_ME') {
    const err = new Error('Missing TURNSTILE_SECRET_KEY');
    err.name = 'ContactConfigError';
    throw err;
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = new Error(`Turnstile siteverify HTTP ${res.status}`);
    err.name = 'ContactTurnstileError';
    throw err;
  }

  const data = await res.json();
  if (!data?.success) {
    const err = new Error('Turnstile verification failed');
    err.name = 'ContactTurnstileRejected';
    err.codes = data?.['error-codes'];
    throw err;
  }
}
