#!/usr/bin/env node
/**
 * Parse advertised lesson rates from src/content/pages/lessons-book.md.
 * Terraform `external` data source requires a JSON object of strings on stdout.
 * Never logs secret values (this script has none).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED_IDS = ['30min', '60min'];

/**
 * @param {string} markdown
 * @returns {{ id: string, label: string, price: string, priceAmount: number }[]}
 */
export function parseLessonRates(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('lessons-book.md is missing YAML frontmatter');
  }
  const rates = [];
  const blockRe =
    /- id:\s*"([^"]+)"\s*\r?\n\s*label:\s*"([^"]+)"\s*\r?\n\s*price:\s*"([^"]+)"\s*\r?\n\s*priceAmount:\s*(\d+)/g;
  for (const part of match[1].matchAll(blockRe)) {
    const priceAmount = Number(part[4]);
    if (!Number.isInteger(priceAmount) || priceAmount < 1) {
      throw new Error(`invalid priceAmount for ${part[1]}`);
    }
    rates.push({
      id: part[1],
      label: part[2],
      price: part[3],
      priceAmount,
    });
  }
  const ids = new Set(rates.map((rate) => rate.id));
  for (const id of REQUIRED_IDS) {
    if (!ids.has(id)) {
      throw new Error(`lessons-book.md rates missing required id ${id}`);
    }
  }
  return rates;
}

/**
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
export function lessonRatesForTerraform(markdown) {
  const rates = parseLessonRates(markdown);
  /** @type {Record<string, string>} */
  const out = { ids: rates.map((rate) => rate.id).join(',') };
  for (const rate of rates) {
    out[`${rate.id}_label`] = rate.label;
    out[`${rate.id}_cents`] = String(rate.priceAmount * 100);
    out[`${rate.id}_price`] = rate.price;
  }
  return out;
}

function defaultMarkdownPath() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'pages', 'lessons-book.md');
}

export function readLessonRatesFromRepo(markdownPath = defaultMarkdownPath()) {
  return lessonRatesForTerraform(readFileSync(markdownPath, 'utf8'));
}

const isDirect =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirect) {
  try {
    process.stdout.write(JSON.stringify(readLessonRatesFromRepo()));
  } catch (err) {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
