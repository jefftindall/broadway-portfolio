/**
 * Casting-reel poster: one stable original path. Studio overwrites the file on
 * `update_reel_url`; `images:optimize` emits `_derived/{sha}/…` for display.
 * Do not reuse gallery stills such as cabaret-reel-poster.jpg.
 */

export const REEL_POSTER_PUBLIC_PATH = '/images/photos/reel-poster.jpg';
export const REEL_POSTER_REPO_PATH = 'public/images/photos/reel-poster.jpg';

const MIN_POSTER_BYTES = 4096;
const FETCH_MS = 10_000;

function looksLikeJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function youtubeVideoId(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (u.hostname.includes('youtube.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        return parts[1] || null;
      }
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Reel URL from an approved `update_reel_url` publish payload.
 * @param {Array<{ tool?: string, commitParams?: Record<string, unknown>, preview?: Record<string, unknown>, content?: string }>} changes
 * @returns {string | undefined}
 */
export function reelUrlFromPublishChanges(changes) {
  const list = Array.isArray(changes) ? changes : [];
  const change = list.find((c) => String(c?.tool || '') === 'update_reel_url');
  if (!change) return undefined;
  const fromParams = change.commitParams?.reelUrl;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();
  const fromPreview = change.preview?.reelUrl;
  if (typeof fromPreview === 'string' && fromPreview.trim()) return fromPreview.trim();
  try {
    const data = JSON.parse(String(change.content || ''));
    if (typeof data?.reelUrl === 'string' && data.reelUrl.trim()) return data.reelUrl.trim();
  } catch {
    // ignore malformed JSON
  }
  return undefined;
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function vimeoVideoId(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!u.hostname.includes('vimeo.com')) return null;
    return u.pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @returns {Promise<Buffer | null>}
 */
async function fetchBinary(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_MS),
    headers: { Accept: 'image/jpeg,image/webp,image/*' },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_POSTER_BYTES || !looksLikeJpeg(buf)) return null;
  return buf;
}

/**
 * Download a still for the reel URL (YouTube maxres → sd → hq, or Vimeo oEmbed).
 * Returns null if the provider has no usable still — caller keeps the existing poster.
 *
 * @param {string} reelUrl
 * @returns {Promise<{ contentBase64: string, contentType: 'image/jpeg' } | null>}
 */
export async function fetchReelPoster(reelUrl) {
  const ytId = youtubeVideoId(reelUrl);
  if (ytId) {
    for (const name of ['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg']) {
      try {
        const buf = await fetchBinary(`https://i.ytimg.com/vi/${ytId}/${name}`);
        if (buf) {
          return { contentBase64: buf.toString('base64'), contentType: 'image/jpeg' };
        }
      } catch {
        // try the next quality
      }
    }
    return null;
  }

  if (!vimeoVideoId(reelUrl)) return null;
  try {
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(String(reelUrl).trim())}`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const thumb = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : '';
    if (!thumb) return null;
    const buf = await fetchBinary(thumb);
    if (!buf) return null;
    return { contentBase64: buf.toString('base64'), contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}
