/** Stable original for the casting-reel click-to-play poster. Studio overwrites this file. */
export const REEL_POSTER_PATH = '/images/photos/reel-poster.jpg';

export function youtubeVideoId(raw: string): string | null {
  try {
    const u = new URL(raw);
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

/** YouTube or Vimeo player URL, or undefined when the watch URL is not embeddable. */
export function videoEmbedUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if (u.hostname.includes('youtu.be') || u.hostname.includes('youtube.com')) {
      const id = youtubeVideoId(raw);
      return id ? `https://www.youtube.com/embed/${id}` : undefined;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * VideoObject for the casting reel. Only includes properties we actually have
 * (Studio title, URL, poster; embed URL when YouTube/Vimeo). Omits description
 * and uploadDate — those are not Studio fields.
 */
export function buildReelVideoJsonLd(opts: {
  name: string;
  contentUrl: string;
  posterPath: string;
  siteUrl: string;
}): Record<string, unknown> | undefined {
  const name = String(opts.name || '').trim();
  const contentUrl = String(opts.contentUrl || '').trim();
  if (!name || !contentUrl) return undefined;

  const video: Record<string, unknown> = {
    '@type': 'VideoObject',
    name,
    contentUrl,
    thumbnailUrl: new URL(opts.posterPath, opts.siteUrl).href,
  };
  const embedUrl = videoEmbedUrl(contentUrl);
  if (embedUrl) video.embedUrl = embedUrl;
  return video;
}
