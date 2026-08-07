import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOWS_DIR = join(ROOT, 'src', 'content', 'shows');
const META_PATH = join(ROOT, 'src', 'content', 'resume-meta.json');
const OUT_PATH = join(ROOT, 'public', 'downloads', 'elyse-tindall-resume.pdf');

const showCategory = z.enum(['musical', 'play', 'cabaret', 'film']).default('musical');

/** Expected venue shape on the resume: "[Theater Name] - [City], [ST]" */
const VENUE_FORMAT = /^.+ - .+, [A-Z]{2}$/;

const showFrontmatterSchema = z.object({
  title: z.string().min(1),
  year: z.number(),
  role: z.string().optional(),
  /** Displayed as-is on the right column; keep "[Theater] - [City], [ST]". */
  venue: z.string().optional(),
  synopsis: z.string().min(1),
  category: showCategory,
  featured: z.boolean().default(false),
  order: z.number().optional(),
});

const resumeMetaSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  specs: z.string().min(1),
  training: z.array(z.string()).min(1),
  specialSkills: z.array(z.string()).min(1),
  residency: z.string().min(1),
  contactFallbacks: z.object({
    email: z.string().min(1),
    phone: z.string().min(1),
  }),
});

/**
 * Parse YAML-like frontmatter without gray-matter (root has no gray-matter dep).
 * Supports the scalar fields used by show credits.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('Missing frontmatter');
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === 'true') data[key] = true;
    else if (value === 'false') data[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = Number(value);
    else data[key] = value;
  }
  return data;
}

function loadShows() {
  const files = readdirSync(SHOWS_DIR).filter((f) => f.endsWith('.md'));
  const shows = [];
  for (const file of files) {
    const raw = readFileSync(join(SHOWS_DIR, file), 'utf8');
    const parsed = showFrontmatterSchema.parse(parseFrontmatter(raw));
    shows.push(parsed);
  }
  return shows;
}

/** Featured first, then year desc, then order asc (newer within year). */
function sortCredits(a, b) {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (b.year !== a.year) return b.year - a.year;
  return (a.order ?? 99) - (b.order ?? 99);
}

function fitText(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

const meta = resumeMetaSchema.parse(JSON.parse(readFileSync(META_PATH, 'utf8')));
const shows = loadShows();
for (const s of shows) {
  if (s.venue && !VENUE_FORMAT.test(s.venue)) {
    console.warn(
      `Resume venue should be "[Theater] - [City], [ST]"; got "${s.venue}" (${s.title})`,
    );
  }
}
const theater = shows
  .filter((s) => s.category !== 'film')
  .sort(sortCredits);
const film = shows.filter((s) => s.category === 'film').sort(sortCredits);

const email = String(process.env.SITE_CONTACT_EMAIL || '').trim() || meta.contactFallbacks.email;
const phone = String(process.env.SITE_CONTACT_PHONE || '').trim() || meta.contactFallbacks.phone;

const pdf = await PDFDocument.create();
const page = pdf.addPage([612, 792]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.08, 0.08, 0.08);
const muted = rgb(0.25, 0.25, 0.25);

let y = 750;
const left = 48;
const right = 564;
const mid = 300;
const venueMax = right - (mid + 40);

function drawCentered(text, size, f = bold) {
  const w = f.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (612 - w) / 2, y, size, font: f, color: ink });
  y -= size + 6;
}

function line(text, size = 9, f = font) {
  page.drawText(text, { x: left, y, size, font: f, color: ink });
  y -= size + 4;
}

function section(title) {
  y -= 8;
  page.drawText(title, { x: left, y, size: 11, font: bold, color: ink });
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: ink });
  y -= 14;
}

function credit(prod, role, venue) {
  const size = 9;
  const title = fitText(prod, bold, size, mid - 50 - left);
  const roleText = fitText(role || '', font, size, 120);
  const venueText = fitText(venue || '', font, size, venueMax);
  page.drawText(title, { x: left, y, size, font: bold, color: ink });
  page.drawText(roleText, { x: mid - 40, y, size, font, color: ink });
  const vw = font.widthOfTextAtSize(venueText, size);
  page.drawText(venueText, { x: right - vw, y, size, font, color: muted });
  y -= size + 5;
  if (y < 48) {
    throw new Error('Resume PDF overflowed the page; trim credits or reduce spacing.');
  }
}

drawCentered(meta.name, 18);
const contact = `${phone}  ·  ${email}  ·  ${meta.location}`;
page.drawText(contact, {
  x: (612 - font.widthOfTextAtSize(contact, 9)) / 2,
  y,
  size: 9,
  font,
  color: muted,
});
y -= 14;
page.drawText(meta.specs, {
  x: (612 - font.widthOfTextAtSize(meta.specs, 9)) / 2,
  y,
  size: 9,
  font,
  color: muted,
});
y -= 6;

section('THEATER');
for (const s of theater) credit(s.title, s.role, s.venue);

section('FILM');
for (const s of film) credit(s.title, s.role, s.venue);

section('TRAINING');
for (const t of meta.training) line(t);

section('SPECIAL SKILLS');
for (const s of meta.specialSkills) line(s);

section('CURRENT RESIDENCY');
line(meta.residency);

const bytes = await pdf.save();
writeFileSync(OUT_PATH, bytes);
console.log(
  `Wrote resume PDF (${theater.length} theater, ${film.length} film) → ${OUT_PATH} (${bytes.length} bytes)`,
);
