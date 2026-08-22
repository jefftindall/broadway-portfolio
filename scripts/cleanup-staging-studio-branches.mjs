#!/usr/bin/env node
/**
 * Delete remote staging-studio-YYYYMMDD branches older than 28 days (UTC).
 * Used by .github/workflows/cleanup-staging-studio-branches.yml
 *
 * Env:
 *   GITHUB_TOKEN (required) — contents:write + pull-requests:write
 *   GITHUB_REPOSITORY (owner/repo) — set automatically on Actions
 *   STAGING_STUDIO_MAX_AGE_DAYS — optional override (default 28)
 *
 * Never prints tokens. Logs branch names only.
 */
import {
  isStagingStudioBranchExpired,
  STAGING_STUDIO_BRANCH_MAX_AGE_DAYS,
  STAGING_STUDIO_BRANCH_PREFIX,
} from '../api/src/lib/studioPublish.js';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY || '';
const maxAgeDays = Number(
  process.env.STAGING_STUDIO_MAX_AGE_DAYS || STAGING_STUDIO_BRANCH_MAX_AGE_DAYS,
);

if (!token) {
  console.error('Missing GITHUB_TOKEN');
  process.exit(1);
}
if (!repoFull.includes('/')) {
  console.error('Missing GITHUB_REPOSITORY (owner/repo)');
  process.exit(1);
}

const [owner, repo] = repoFull.split('/');
const api = 'https://api.github.com';

async function gh(path, opts = {}) {
  const res = await fetch(`${api}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function listMatchingBranches() {
  /** @type {string[]} */
  const names = [];
  let page = 1;
  for (;;) {
    const batch = await gh(
      `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const b of batch) {
      const name = String(b.name || '');
      if (name.startsWith(STAGING_STUDIO_BRANCH_PREFIX)) names.push(name);
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return names;
}

async function deleteBranch(name) {
  await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

const now = new Date();
const branches = await listMatchingBranches();
const expired = branches.filter((n) => isStagingStudioBranchExpired(n, now, maxAgeDays));

console.log(
  `Found ${branches.length} ${STAGING_STUDIO_BRANCH_PREFIX}* branch(es); ${expired.length} older than ${maxAgeDays} day(s).`,
);

for (const name of expired) {
  process.stdout.write(`Deleting ${name}… `);
  await deleteBranch(name);
  console.log('ok');
}

if (expired.length === 0) {
  console.log('Nothing to delete.');
}
