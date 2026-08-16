import { readFileSync, writeFileSync } from 'node:fs';

const REDACT = '[REDACTED]';
const SENSITIVE_QUERY = new Set([
  'code',
  'id_token',
  'access_token',
  'refresh_token',
  'session_state',
  'client_secret',
  'password',
  'passwd',
  'otc',
]);
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY.has(key.toLowerCase())) {
        u.searchParams.set(key, REDACT);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function redactHeaders(headers: { name?: string; value?: string }[] | undefined) {
  if (!Array.isArray(headers)) return;
  for (const h of headers) {
    if (h?.name && SENSITIVE_HEADERS.has(h.name.toLowerCase())) {
      h.value = REDACT;
    }
  }
}

function redactQuery(qs: { name?: string; value?: string }[] | undefined) {
  if (!Array.isArray(qs)) return;
  for (const q of qs) {
    if (q?.name && SENSITIVE_QUERY.has(q.name.toLowerCase())) {
      q.value = REDACT;
    }
  }
}

function redactPostData(postData: { text?: string } | undefined) {
  if (!postData?.text) return;
  postData.text = postData.text
    .replace(/(password|passwd|client_secret|code|refresh_token)=([^&]*)/gi, `$1=${REDACT}`)
    .replace(/"(password|passwd|client_secret|access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/gi, `"$1":"${REDACT}"`);
}

/** Strip auth codes, tokens, cookies, and passwords from a Playwright HAR file. */
export function redactHarFile(harPath: string): void {
  let raw: string;
  try {
    raw = readFileSync(harPath, 'utf8');
  } catch {
    return;
  }
  let har: {
    log?: { entries?: Array<{ request?: Record<string, unknown>; response?: Record<string, unknown> }> };
  };
  try {
    har = JSON.parse(raw);
  } catch {
    return;
  }
  for (const entry of har.log?.entries ?? []) {
    const req = entry.request as
      | {
          url?: string;
          headers?: { name?: string; value?: string }[];
          queryString?: { name?: string; value?: string }[];
          postData?: { text?: string };
        }
      | undefined;
    const res = entry.response as { headers?: { name?: string; value?: string }[] } | undefined;
    if (req?.url) req.url = redactUrl(req.url);
    redactHeaders(req?.headers);
    redactQuery(req?.queryString);
    redactPostData(req?.postData);
    redactHeaders(res?.headers);
  }
  writeFileSync(harPath, JSON.stringify(har));
}
