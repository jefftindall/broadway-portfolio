import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { trackEvent } from './telemetry.js';
import {
  isStudioPrPublishMode,
  stagingStudioBranchName,
  stagingStudioPrBody,
  stagingStudioPrTitle,
  studioPublishMode,
} from './studioPublish.js';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizePrivateKey(key) {
  // Key Vault / app settings often store PEM with literal \n
  return key.replace(/\\n/g, '\n');
}

/**
 * Prefer GitHub App installation tokens (short-lived).
 * Optional GITHUB_TOKEN fallback for local/dev only.
 */
export function getOctokit() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (appId && installationId && privateKey) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: normalizePrivateKey(privateKey),
        installationId: Number(installationId),
      },
    });
  }

  if (process.env.GITHUB_TOKEN) {
    return new Octokit({ auth: process.env.GITHUB_TOKEN });
  }

  throw new Error(
    'GitHub auth not configured. Set GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY (or GITHUB_TOKEN for local dev).',
  );
}

export function repoInfo() {
  return {
    owner: required('GITHUB_OWNER'),
    repo: required('GITHUB_REPO'),
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

/** Production / direct-commit base branch (usually main). */
export function baseBranch() {
  return process.env.GITHUB_BRANCH || 'main';
}

/**
 * Branch used for catalog reads (draft/compose). In PR mode, prefer today's
 * staging-studio branch when it already exists so same-day edits stack.
 * @returns {Promise<string>}
 */
export async function resolveContentBranch() {
  const base = baseBranch();
  if (!isStudioPrPublishMode()) return base;
  const staging = stagingStudioBranchName();
  if (await branchExists(staging)) return staging;
  return base;
}

/**
 * @param {string} branch
 * @returns {Promise<boolean>}
 */
export async function branchExists(branch) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  try {
    await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

/**
 * @param {string} branch
 * @returns {Promise<string>} tip commit SHA
 */
export async function getBranchSha(branch) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const { data } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  return data.object.sha;
}

/**
 * Create branch from base when missing; merge base into branch so prod updates flow in.
 * @param {string} branch
 * @param {string} [base]
 */
export async function ensureBranchFromBase(branch, base = baseBranch()) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const exists = await branchExists(branch);
  if (!exists) {
    const sha = await getBranchSha(base);
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });
    trackEvent('StudioStagingBranchCreated', { branch, base, sha });
    return { created: true, merged: false };
  }

  // Bring latest base commits into the staging branch (prod → staging).
  try {
    const { data } = await octokit.repos.merge({
      owner,
      repo,
      base: branch,
      head: base,
      commit_message: `chore: merge ${base} into ${branch}`,
    });
    const merged = Boolean(data && data.sha);
    if (merged) {
      trackEvent('StudioStagingBranchMergedBase', { branch, base, sha: data.sha });
    }
    return { created: false, merged };
  } catch (err) {
    // 204 / empty = already up to date (Octokit may not throw)
    if (err.status === 204) return { created: false, merged: false };
    if (err.status === 409) {
      const conflict = new Error(
        `Could not merge ${base} into ${branch} (conflict). Resolve the staging branch or wait for daily cleanup.`,
      );
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

/**
 * Prepare the git target for a Studio publish (and media upload).
 * @returns {Promise<{ mode: 'pr'|'direct', branch: string, base: string }>}
 */
export async function preparePublishTarget() {
  const mode = studioPublishMode();
  const base = baseBranch();
  if (mode !== 'pr') {
    return { mode: 'direct', branch: base, base };
  }
  const branch = stagingStudioBranchName();
  await ensureBranchFromBase(branch, base);
  return { mode: 'pr', branch, base };
}

/**
 * Open or reuse an open PR from head → base.
 * @param {{ head: string, base: string, title?: string, body?: string }} opts
 */
export async function ensurePullRequest({ head, base, title, body }) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const prTitle = title || stagingStudioPrTitle();
  const prBody = body || stagingStudioPrBody({ branch: head, base });

  const { data: open } = await octokit.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${head}`,
    base,
    per_page: 5,
  });
  if (Array.isArray(open) && open.length > 0) {
    const existing = open[0];
    trackEvent('StudioStagingPrReused', {
      branch: head,
      base,
      prNumber: String(existing.number),
    });
    return {
      number: existing.number,
      url: existing.html_url,
      created: false,
    };
  }

  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title: prTitle,
    body: prBody,
  });
  trackEvent('StudioStagingPrCreated', {
    branch: head,
    base,
    prNumber: String(data.number),
  });
  return {
    number: data.number,
    url: data.html_url,
    created: true,
  };
}

/**
 * @param {string} path
 * @param {string} [branch]
 */
export async function getFileSha(path, branch) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const ref = branch || (await resolveContentBranch());
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (Array.isArray(data)) return null;
    return data.sha;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

const TRANSIENT_GITHUB_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECANCELED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Whether a GitHub / network error is worth retrying.
 * Exported for unit tests.
 * @param {unknown} err
 */
export function isTransientGithubError(err) {
  if (!err || typeof err !== 'object') return false;
  const status = /** @type {{ status?: number }} */ (err).status;
  if (status != null && TRANSIENT_GITHUB_STATUS.has(Number(status))) return true;
  const code =
    /** @type {{ code?: string, cause?: { code?: string } }} */ (err).code ||
    /** @type {{ cause?: { code?: string } }} */ (err).cause?.code;
  if (code && TRANSIENT_NETWORK_CODES.has(String(code))) return true;
  const message = String(/** @type {{ message?: string }} */ (err).message || '').toLowerCase();
  return /timeout|network|socket hang up|econnreset|temporarily unavailable|fetch failed|gateway/.test(
    message,
  );
}

/**
 * True when updateRef failed because the branch tip moved (safe to rebuild commit).
 * Does not treat protected-ref / ruleset denials as races — those will not succeed on retry.
 * @param {unknown} err
 */
export function isGithubTipRaceError(err) {
  if (!err || typeof err !== 'object') return false;
  const message = String(/** @type {{ message?: string }} */ (err).message || '');
  if (/protected ref|required status checks|ruleset/i.test(message)) return false;
  const status = /** @type {{ status?: number }} */ (err).status;
  if (status === 409) return true;
  if (status === 422 && /fast.?forward/i.test(message)) return true;
  return /update is not a fast forward|not a fast-forward/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry GitHub writes on transient failures and tip races.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ label?: string, maxAttempts?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withGithubRetry(fn, opts = {}) {
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 4);
  const label = opts.label || 'github';
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const tipRace = isGithubTipRaceError(err);
      const transient = tipRace || isTransientGithubError(err);
      if (!transient || attempt >= maxAttempts) throw err;
      const delayMs =
        Math.min(8000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
      trackEvent('GitHubCommitRetry', {
        label,
        attempt: String(attempt),
        status: String(/** @type {{ status?: number }} */ (err)?.status || ''),
        reason: tipRace ? 'tip_race' : 'transient',
      });
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

/**
 * Encode file content for git.createBlob (always base64).
 * @param {{ content: string | Buffer, binary?: boolean }} file
 */
export function encodeBlobContent(file) {
  if (file.binary) {
    if (Buffer.isBuffer(file.content)) return file.content.toString('base64');
    return String(file.content);
  }
  return Buffer.from(String(file.content ?? ''), 'utf8').toString('base64');
}

/**
 * Atomically create/update one or more files in a **single** git commit (Git Data API).
 * Retries the whole operation on transient errors or concurrent tip races — nothing is
 * visible on the branch until the final ref update succeeds.
 *
 * @param {{
 *   files: Array<{ path: string, content: string | Buffer, binary?: boolean }>,
 *   message: string,
 *   branch?: string,
 * }} opts
 * @returns {Promise<{ branch: string, commitSha: string, treeSha: string, files: Array<{ path: string, sha: string }> }>}
 */
export async function commitFiles({ files, message, branch }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files to commit.');
  }
  const normalized = files.map((f) => {
    const path = String(f.path || '').replace(/\\/g, '/');
    if (!path || path.includes('..') || path.startsWith('/')) {
      throw new Error(`Invalid commit path: ${f.path}`);
    }
    return { path, content: f.content, binary: Boolean(f.binary) };
  });
  // Dedupe by path (last write wins) so photo + markdown never collide unexpectedly.
  const byPath = new Map();
  for (const f of normalized) byPath.set(f.path, f);
  const uniqueFiles = [...byPath.values()];

  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const targetBranch = branch || (await resolveContentBranch());
  const pathSummary = uniqueFiles.map((f) => f.path).join(',');

  try {
    const result = await withGithubRetry(
      async () => {
        const tipSha = await getBranchSha(targetBranch);
        const { data: tipCommit } = await octokit.git.getCommit({
          owner,
          repo,
          commit_sha: tipSha,
        });
        const baseTreeSha = tipCommit.tree.sha;

        const blobResults = await Promise.all(
          uniqueFiles.map(async (file) => {
            const { data: blob } = await octokit.git.createBlob({
              owner,
              repo,
              content: encodeBlobContent(file),
              encoding: 'base64',
            });
            return { path: file.path, sha: blob.sha };
          }),
        );

        const { data: newTree } = await octokit.git.createTree({
          owner,
          repo,
          base_tree: baseTreeSha,
          tree: blobResults.map((b) => ({
            path: b.path,
            mode: '100644',
            type: 'blob',
            sha: b.sha,
          })),
        });

        const { data: newCommit } = await octokit.git.createCommit({
          owner,
          repo,
          message: String(message || 'content: studio update'),
          tree: newTree.sha,
          parents: [tipSha],
        });

        await octokit.git.updateRef({
          owner,
          repo,
          ref: `heads/${targetBranch}`,
          sha: newCommit.sha,
          force: false,
        });

        return {
          branch: targetBranch,
          commitSha: newCommit.sha,
          treeSha: newTree.sha,
          files: blobResults,
        };
      },
      { label: 'commitFiles' },
    );

    trackEvent('GitHubCommitSucceeded', {
      path: pathSummary,
      branch: targetBranch,
      sha: result.commitSha,
      fileCount: String(uniqueFiles.length),
    });
    return result;
  } catch (err) {
    trackEvent('GitHubCommitFailed', {
      path: pathSummary,
      branch: targetBranch,
      error: err instanceof Error ? err.message : String(err),
      fileCount: String(uniqueFiles.length),
    });
    throw err;
  }
}

/**
 * Create or update a single file in one commit (wrapper around {@link commitFiles}).
 * @param {{ path: string, content: string | Buffer, message: string, binary?: boolean, branch?: string }} opts
 */
export async function commitFile({ path, content, message, binary = false, branch }) {
  const result = await commitFiles({
    files: [{ path, content, binary }],
    message,
    branch,
  });
  return {
    path,
    branch: result.branch,
    sha: result.files[0]?.sha,
    commitSha: result.commitSha,
  };
}

/**
 * List file paths under a repo directory (non-recursive).
 * @param {string} dir
 * @param {string} [branch]
 * @returns {Promise<string[]>}
 */
export async function listRepoFiles(dir, branch) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const ref = branch || (await resolveContentBranch());
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: dir,
      ref,
    });
    if (!Array.isArray(data)) return [];
    return data.filter((f) => f.type === 'file' && f.path).map((f) => f.path);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Read a text file from the repo branch.
 * @param {string} path
 * @param {string} [branch]
 * @returns {Promise<string | null>}
 */
export async function readRepoTextFile(path, branch) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const ref = branch || (await resolveContentBranch());
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export function toFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${JSON.stringify(String(item))}`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(value))}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}
