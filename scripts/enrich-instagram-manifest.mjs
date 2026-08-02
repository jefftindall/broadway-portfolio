import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dir = 'public/images/gallery/instagram';
const manifestPath = path.join(dir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function shortcodeToDate(code) {
  let id = 0n;
  for (const c of code) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) return null;
    id = id * 64n + BigInt(i);
  }
  return new Date(Number(id >> 23n) + 1314220021721).toISOString().slice(0, 10);
}
function shortcodeFromUrl(url) {
  const m = String(url).match(/\/(p|reel)\/([^/?#]+)/);
  return m ? m[2] : null;
}

/** Visual review keyed by canonical filename (applied to all files with same content hash). */
const byFile = {
  'ig-001.jpg': {
    caption: 'Portrait in front of St. Paul’s Cathedral',
    location: 'London, UK — St. Paul’s Cathedral',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Daytime travel portrait; white blouse, sunglasses on head.',
  },
  'ig-002.jpg': {
    caption: 'Portrait on the South Bank with Big Ben behind',
    location: 'London, UK — South Bank / River Thames',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Dusk walkway portrait facing Palace of Westminster.',
  },
  'ig-004.jpg': {
    caption: 'Forced-perspective pose with the Eiffel Tower',
    location: 'Paris, France — Seine / Eiffel Tower',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'dark',
    notes: 'Night tourist shot; cream coat over black dress.',
  },
  'ig-005.jpg': {
    caption: 'Street selfie on the Champs-Élysées',
    location: 'Paris, France — Avenue des Champs-Élysées',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Monoprix / Champs-Élysées signage visible; companion on phone.',
  },
  'ig-006.jpg': {
    caption: 'Night selfie with a friend outdoors',
    location: 'Outdoor public space (park/plaza with string lights)',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'dark',
    notes: 'Festive string lights; casual evening outing.',
  },
  'ig-007.jpg': {
    caption: 'Friends in matching Disney ear headbands',
    location: 'Walt Disney World (theme park)',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Group of three; Disney castle ear headbands.',
  },
  'ig-008.jpg': {
    caption: 'Airport terminal with suitcase and coffee',
    location: 'Airport terminal (Delta aircraft visible)',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Winter coat and scarf; travel day portrait.',
  },
  'ig-009.jpg': {
    caption: 'Friends arm-in-arm on a football field at sunset',
    location: 'High-school athletic stadium (WHS painted jeans)',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Senior-sunset style; musical motifs on painted jeans.',
  },
  'ig-011.jpg': {
    caption: 'Night portrait with Eiffel Tower and bateau',
    location: 'Paris, France — Seine / Eiffel Tower',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'dark',
    notes: 'Waist-up night portrait; tour boat reflections.',
  },
  'ig-030.jpg': {
    caption: 'Walking a snowy city sidewalk with a friend',
    location: 'Urban street (snowy day)',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Seen from behind in cream coat; active snowfall.',
  },
  'ig-040.jpg': {
    caption: 'Night amphitheater selfie with friends',
    location: 'Outdoor amphitheater / Disney nighttime show seating',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'dark',
    notes: 'Disney ear headbands and pin lanyards in bleachers.',
  },
  'ig-051.jpg': {
    caption: 'Standing in snowy Times Square',
    location: 'New York, NY — Times Square',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'dark',
    notes: 'Happy New Year 2024 billboard; Broadway ads; winter puffer.',
    dateOverride: '2024-01',
    datePrecision: 'month',
  },
  'ig-062.jpg': {
    caption: 'Night outdoor selfie with a friend',
    location: 'Outdoor downtown / park at night',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'dark',
    notes: 'Streetlights and fairy lights behind metal fence.',
  },
  'ig-071.jpg': {
    caption: 'Tropical bay landscape from rocky shore',
    location: 'Coastal / tropical bay (island destination)',
    elyseInPhoto: false,
    theme: 'travel',
    lighting: 'light',
    notes: 'Scenic landscape only; no people.',
  },
  'ig-072.jpg': {
    caption: 'Walking a cobblestone lane in a trench coat',
    location: 'New York, NY — historic mews / Village-style street (likely)',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'light',
    notes: 'Shot from behind; cream belted trench.',
  },
  'ig-081.jpg': {
    caption: 'Cast group on stage with medals and numbers',
    location: 'Theater stage',
    elyseInPhoto: true,
    theme: 'performance',
    lighting: 'dark',
    notes: 'Post-show / competition energy; medals and numbered tags.',
  },
  'ig-082.jpg': {
    caption: 'Playful trio posing on a black-box floor',
    location: 'Black-box / rehearsal studio',
    elyseInPhoto: true,
    theme: 'rehearsal',
    lighting: 'dark',
    notes: 'Casual rehearsal clothes; spike mark on floor.',
  },
  'ig-091.jpg': {
    caption: 'Porch portrait in a striped midi dress',
    location: 'Residential front porch',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Daylight lifestyle portrait.',
  },
  'ig-092.jpg': {
    caption: 'Casual porch portrait with glasses',
    location: 'Residential front porch',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Yellow top, jeans, sneakers; smiling at camera.',
  },
  'ig-102.jpg': {
    caption: 'Large ensemble onstage — “my new family”',
    location: 'Theater stage',
    elyseInPhoto: true,
    theme: 'performance',
    lighting: 'light',
    notes: 'Graphic overlay; intensive / cast family moment.',
  },
  'ig-103.jpg': {
    caption: 'Red-and-black ensemble pose in studio',
    location: 'Dance / rehearsal studio with mirrors',
    elyseInPhoto: true,
    theme: 'rehearsal',
    lighting: 'light',
    notes: 'Coordinated rehearsal look; ballet barre visible.',
  },
  'ig-114.jpg': {
    caption: 'Studio huddle group portrait',
    location: 'Dance / rehearsal studio',
    elyseInPhoto: true,
    theme: 'rehearsal',
    lighting: 'light',
    notes: 'Mirrored wall; bright practice-room lighting.',
  },
  'ig-115.jpg': {
    caption: 'Speakers in the aisle of an ornate theater',
    location: 'Professional theater auditorium (Moulin Rouge–style proscenium)',
    elyseInPhoto: false,
    theme: 'performance',
    lighting: 'dark',
    notes: 'Audience POV; workshop/Q&A vibe. Elyse not clearly identifiable.',
  },
  'ig-126.jpg': {
    caption: 'Birthday celebration with “16” balloons',
    location: 'Private residence / living room',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'TV shows Encanto karaoke; Windows clock readable as 4/17/2022 8:53 PM.',
    dateOverride: '2022-04-17',
    datePrecision: 'day',
  },
  'ig-127.jpg': {
    caption: 'Laughing at a table with messy dessert plate',
    location: 'Home dining room',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Candid celebration moment; frosting on hands.',
  },
  'ig-135.jpg': {
    caption: 'Group at What Lifts You wings mural',
    location: 'Public mural (Kelsey Montague “What Lifts You” style)',
    elyseInPhoto: true,
    theme: 'travel',
    lighting: 'dark',
    notes: 'Blue event lanyards; conference/festival outing energy.',
  },
  'ig-136.jpg': {
    caption: 'Hallway break with Häagen-Dazs and phone',
    location: 'Indoor hallway (school / venue / intensive)',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Red lanyard; candid behind-the-scenes break.',
  },
  'ig-147.jpg': {
    caption: 'Miss You Like Hell marquee graphic',
    location: null,
    elyseInPhoto: false,
    theme: 'performance',
    lighting: 'light',
    notes: 'Promotional illustration for the musical; no people.',
  },
  'ig-148.jpg': {
    caption: 'Dim mirror selfie in denim jacket',
    location: 'Indoor (low light / backstage-adjacent)',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'dark',
    notes: 'Close-up mirror selfie; blue-purple ambient light.',
  },
  'ig-158.jpg': {
    caption: 'Miss You Like Hell marquee graphic (variant)',
    location: null,
    elyseInPhoto: false,
    theme: 'performance',
    lighting: 'light',
    notes: 'Promotional illustration variant; no people.',
  },
  'ig-159.jpg': {
    caption: 'Stage work lights and cast during tech/rehearsal',
    location: 'Indoor auditorium / community theater',
    elyseInPhoto: true,
    theme: 'rehearsal',
    lighting: 'light',
    notes: 'Orange A-frame ladder, LX grid, projected backdrop.',
  },
  'ig-170.jpg': {
    caption: 'Laughing with a friend at a restaurant',
    location: 'Restaurant / diner',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'dark',
    notes: 'Warm indoor dining light; shopping bags on table.',
  },
  'ig-171.jpg': {
    caption: 'Playful close-up selfie with a friend',
    location: 'Indoor restaurant / booth',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'dark',
    notes: 'Silly faces; warm reddish cast.',
  },
  'ig-182.jpg': {
    caption: 'Hamilton set from the house',
    location: 'Theater auditorium (Hamilton production)',
    elyseInPhoto: false,
    theme: 'performance',
    lighting: 'dark',
    notes: 'Audience POV of wooden scaffolding set; Elyse not visible.',
  },
  'ig-183.jpg': {
    caption: 'Hamilton program at the Fox Theatre',
    location: 'Fox Theatre (Atlanta) — Hamilton',
    elyseInPhoto: false,
    theme: 'performance',
    lighting: 'light',
    notes: 'Encore/Fox Theatre program cover in warm gold house light.',
  },
  'ig-192.jpg': {
    caption: 'Store mirror selfie with two friends',
    location: 'Retail store aisle',
    elyseInPhoto: true,
    theme: 'life',
    lighting: 'light',
    notes: 'Casual outing; fluorescent retail lighting.',
  },
  'ig-193.jpg': {
    caption: 'Friend eating ice cream on transit',
    location: 'Bus or train interior',
    elyseInPhoto: false,
    theme: 'life',
    lighting: 'light',
    notes: 'Candid of another person; not Elyse.',
  },
  'ig-202.jpg': {
    caption: 'Collage from a drama intensive / “6th floor forever”',
    location: 'Performing-arts intensive / dorm & stage spaces',
    elyseInPhoto: true,
    theme: 'rehearsal',
    lighting: 'light',
    notes: 'Multi-panel collage: group life + stage scenes.',
  },
};

const hashOf = new Map();
const files = fs.readdirSync(dir).filter((f) => /^ig-\d+\./.test(f));
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  hashOf.set(f, {
    hash: crypto.createHash('sha1').update(buf).digest('hex'),
    size: buf.length,
  });
}

const reviewByHash = new Map();
for (const [file, meta] of Object.entries(byFile)) {
  const info = hashOf.get(file);
  if (!info) {
    console.warn('missing file for review key', file);
    continue;
  }
  reviewByHash.set(info.hash, { ...meta, canonicalFile: file, contentHash: info.hash });
}

const chrome = {
  caption: 'UI chrome / avatar (not a feed photo)',
  location: null,
  elyseInPhoto: false,
  theme: 'life',
  lighting: 'light',
  notes:
    'Small asset scraped from Instagram UI (profile avatar or similar). Prefer excluding from gallery.',
  usable: false,
  assetKind: 'chrome',
};

const enriched = manifest.items.map((item) => {
  const info = hashOf.get(item.file) || { hash: null, size: 0 };
  const shortcode = shortcodeFromUrl(item.postUrl);
  const postDate = shortcode ? shortcodeToDate(shortcode) : null;
  let review = info.hash ? reviewByHash.get(info.hash) : null;
  if (!review) {
    if (info.size > 0 && info.size < 15000) {
      review = { ...chrome, contentHash: info.hash };
    } else {
      review = {
        caption: 'Unreviewed image',
        location: null,
        elyseInPhoto: null,
        theme: null,
        lighting: null,
        notes: 'No visual review entry yet.',
        usable: info.size >= 15000,
        contentHash: info.hash,
      };
    }
  }

  const date = review.dateOverride || postDate;
  const { dateOverride, datePrecision, ...rest } = review;
  return {
    ...item,
    shortcode,
    postDate,
    date,
    datePrecision: datePrecision || (dateOverride ? 'inferred' : 'post'),
    dateSource: dateOverride ? 'visual-clue' : postDate ? 'instagram-shortcode' : null,
    location: rest.location ?? null,
    elyseInPhoto: rest.elyseInPhoto,
    theme: rest.theme,
    lighting: rest.lighting,
    caption: rest.caption,
    notes: rest.notes,
    usable: rest.usable !== false && info.size >= 15000,
    assetKind: rest.assetKind || (info.size < 15000 ? 'chrome' : 'photo'),
    contentHash: info.hash,
    bytes: info.size,
    duplicateOf: rest.canonicalFile && rest.canonicalFile !== item.file ? rest.canonicalFile : null,
  };
});

const uniqueUsable = [
  ...new Map(enriched.filter((i) => i.usable).map((i) => [i.contentHash, i])).values(),
];

const out = {
  username: manifest.username,
  downloadedAt: manifest.downloadedAt,
  enrichedAt: new Date().toISOString(),
  enrichmentNotes: [
    'postDate approximated from Instagram shortcode timestamp encoding.',
    'Visual fields from local image review; location/theme/elyseInPhoto are best-effort.',
    'Many downloads are duplicate hashes (carousel/UI pollution); see uniqueUsableFiles.',
    'theme enum: travel | rehearsal | performance | life',
    'lighting enum: light | dark',
  ],
  stats: {
    totalItems: enriched.length,
    uniqueHashes: new Set(enriched.map((i) => i.contentHash)).size,
    usableItems: enriched.filter((i) => i.usable).length,
    uniqueUsable: uniqueUsable.length,
    chromeItems: enriched.filter((i) => i.assetKind === 'chrome').length,
  },
  uniqueUsableFiles: uniqueUsable
    .map((i) => i.file)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  items: enriched,
};

fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.stats, null, 2));
console.log('uniqueUsable count', out.uniqueUsableFiles.length);
