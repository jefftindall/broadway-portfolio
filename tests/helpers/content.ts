import fs from 'node:fs';
import path from 'node:path';

const CONTENT_ROOT = path.join(process.cwd(), 'src/content');

type Frontmatter = Record<string, string>;

function parseFrontmatter(filePath: string): Frontmatter {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fm: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const simple = line.match(/^([\w-]+):\s*(.+)$/);
    if (simple) {
      fm[simple[1]] = simple[2].replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

function listMarkdownIds(collection: string): string[] {
  const dir = path.join(CONTENT_ROOT, collection);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
    .sort();
}

/** Stable slug for smoke/journey sampling (first alphabetically). */
export function sampleCastingSlug(): string {
  const slugs = listMarkdownIds('casting');
  if (!slugs.length) throw new Error('No casting pages in src/content/casting');
  return slugs[0]!;
}

export function sampleShowTitle(): string {
  const titles = listShowCredits().map((s) => s.title);
  if (!titles.length) throw new Error('No shows in src/content/shows');
  return titles[0]!;
}

export function listShowCredits(): { title: string; category: string }[] {
  const dir = path.join(CONTENT_ROOT, 'shows');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const fm = parseFrontmatter(path.join(dir, name));
      return {
        title: fm.title ?? name.replace(/\.md$/, ''),
        category: fm.category ?? 'musical',
      };
    });
}

export function musicalShowTitle(): string {
  const show = listShowCredits().find((s) => s.category === 'musical');
  if (!show) throw new Error('No musical show in content');
  return show.title;
}

export function filmShowTitle(): string {
  const show = listShowCredits().find((s) => s.category === 'film');
  if (!show) throw new Error('No film show in content');
  return show.title;
}

export function newestNewsPost(): { slug: string; title: string } {
  const dir = path.join(CONTENT_ROOT, 'news');
  const posts = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const filePath = path.join(dir, name);
      const fm = parseFrontmatter(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const draft = /\ndraft:\s*true\b/.test(raw);
      return {
        slug: name.replace(/\.md$/, ''),
        title: fm.title ?? name,
        date: fm.date ? Date.parse(fm.date) : 0,
        draft,
      };
    })
    .filter((p) => !p.draft && p.date > 0)
    .sort((a, b) => b.date - a.date);

  if (!posts.length) throw new Error('No published news posts in content');
  const top = posts[0]!;
  return { slug: top.slug, title: top.title };
}

export function castingPageExpectations(slug: string): { title: string; cta: string } {
  const fm = parseFrontmatter(path.join(CONTENT_ROOT, 'casting', `${slug}.md`));
  return {
    title: fm.title ?? slug,
    cta: fm.cta ?? 'Request materials',
  };
}

export const primaryNav = [
  { href: '/shows', label: 'Shows' },
  { href: '/materials', label: 'Materials' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/about', label: 'About' },
  { href: '/news', label: 'News' },
  { href: '/contact', label: 'Contact' },
] as const;
