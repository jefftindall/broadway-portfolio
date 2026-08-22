import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { formatResidencyItem, resumeMetaSchema } from './generate-resume-pdf.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const META_PATH = join(ROOT, 'src', 'content', 'resume-meta.json');
const PDF_PATH = join(ROOT, 'public', 'downloads', 'elyse-tindall-resume.pdf');

function pdfTextPayload(pdfBytes) {
  const latin1 = pdfBytes.toString('latin1');
  const chunks = [];
  const streamRe = /\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of latin1.matchAll(streamRe)) {
    try {
      chunks.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
    } catch {
      // XRef and other binary streams are not page text.
    }
  }
  const decoded = [];
  for (const hex of chunks.join('\n').matchAll(/<([0-9A-Fa-f]+)>/g)) {
    decoded.push(Buffer.from(hex[1], 'hex').toString('latin1'));
  }
  return decoded.join('\n');
}

test('resume meta lists past residencies with year ranges and companies', () => {
  const meta = resumeMetaSchema.parse(JSON.parse(readFileSync(META_PATH, 'utf8')));
  const alliance = meta.residencies.find((entry) => /alliance theatre/i.test(entry.company));
  assert.ok(alliance, 'expected an Alliance Theatre residency');
  assert.equal(alliance.years, '2025–2026');
});

test('formatResidencyItem joins year range and company', () => {
  assert.equal(
    formatResidencyItem({
      years: '2025–2026',
      company: 'Alliance Theatre Mainstage Teen Ensemble',
    }),
    '2025–2026  Alliance Theatre Mainstage Teen Ensemble',
  );
});

test('generated PDF uses Past Residencies, not Current Residency', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'generate-resume-pdf.mjs')], {
    cwd: ROOT,
  });
  const text = pdfTextPayload(readFileSync(PDF_PATH));
  assert.match(text, /PAST RESIDENCIES/);
  assert.doesNotMatch(text, /CURRENT RESIDENCY/);
  assert.match(text, /2025/);
  assert.match(text, /Alliance Theatre/);
});
