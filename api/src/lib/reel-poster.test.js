import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REEL_POSTER_PUBLIC_PATH,
  REEL_POSTER_REPO_PATH,
  fetchReelPoster,
  reelUrlFromPublishChanges,
  vimeoVideoId,
  youtubeVideoId,
} from './reelPoster.js';

test('youtubeVideoId parses watch, short, and embed URLs', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=41jdPTkN_Sw'), '41jdPTkN_Sw');
  assert.equal(youtubeVideoId('https://youtu.be/41jdPTkN_Sw'), '41jdPTkN_Sw');
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/41jdPTkN_Sw'), '41jdPTkN_Sw');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/41jdPTkN_Sw'), '41jdPTkN_Sw');
  assert.equal(youtubeVideoId('https://vimeo.com/123'), null);
});

test('reelUrlFromPublishChanges reads commitParams then JSON content', () => {
  assert.equal(
    reelUrlFromPublishChanges([
      {
        tool: 'update_reel_url',
        commitParams: { reelUrl: 'https://youtu.be/41jdPTkN_Sw' },
      },
    ]),
    'https://youtu.be/41jdPTkN_Sw',
  );
  assert.equal(
    reelUrlFromPublishChanges([
      {
        tool: 'update_reel_url',
        content: JSON.stringify({ reelUrl: 'https://youtu.be/abc' }),
      },
    ]),
    'https://youtu.be/abc',
  );
  assert.equal(reelUrlFromPublishChanges([{ tool: 'update_short_bio' }]), undefined);
});

test('vimeoVideoId parses vimeo paths', () => {
  assert.equal(vimeoVideoId('https://vimeo.com/123456'), '123456');
  assert.equal(vimeoVideoId('https://youtu.be/abc'), null);
});

test('reel poster paths stay on the generic photos original', () => {
  assert.equal(REEL_POSTER_PUBLIC_PATH, '/images/photos/reel-poster.jpg');
  assert.equal(REEL_POSTER_REPO_PATH, 'public/images/photos/reel-poster.jpg');
});

test('fetchReelPoster uses maxres then falls back to hqdefault', async () => {
  const jpeg = Buffer.alloc(5000, 0xff);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  const hits = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    hits.push(String(url));
    if (String(url).includes('maxresdefault')) {
      return new Response(null, { status: 404 });
    }
    if (String(url).includes('sddefault')) {
      return new Response(null, { status: 404 });
    }
    return new Response(jpeg, { status: 200 });
  };
  try {
    const poster = await fetchReelPoster('https://youtu.be/41jdPTkN_Sw');
    assert.ok(poster);
    assert.equal(poster.contentType, 'image/jpeg');
    assert.equal(poster.contentBase64, jpeg.toString('base64'));
    assert.deepEqual(hits, [
      'https://i.ytimg.com/vi/41jdPTkN_Sw/maxresdefault.jpg',
      'https://i.ytimg.com/vi/41jdPTkN_Sw/sddefault.jpg',
      'https://i.ytimg.com/vi/41jdPTkN_Sw/hqdefault.jpg',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchReelPoster returns null when no still is large enough', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.alloc(100), { status: 200 });
  try {
    assert.equal(await fetchReelPoster('https://youtu.be/41jdPTkN_Sw'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchReelPoster uses Vimeo oEmbed thumbnail_url', async () => {
  const jpeg = Buffer.alloc(5000, 0xff);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('vimeo.com/api/oembed.json')) {
      return new Response(JSON.stringify({ thumbnail_url: 'https://i.vimeocdn.com/video/still.jpg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (href.includes('i.vimeocdn.com')) {
      return new Response(jpeg, { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const poster = await fetchReelPoster('https://vimeo.com/123456');
    assert.ok(poster);
    assert.equal(poster.contentType, 'image/jpeg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
