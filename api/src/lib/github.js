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

/**
 * Create or update a file via GitHub Contents API.
 * @param {{ path: string, content: string | Buffer, message: string, binary?: boolean, branch?: string }} opts
 */
export async function commitFile({ path, content, message, binary = false, branch }) {
  const octokit = getOctokit();
  const { owner, repo } = repoInfo();
  const targetBranch = branch || (await resolveContentBranch());
  const sha = await getFileSha(path, targetBranch);
  const contentBase64 = binary
    ? Buffer.isBuffer(content)
      ? content.toString('base64')
      : String(content)
    : Buffer.from(content, 'utf8').toString('base64');

  try {
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: contentBase64,
      branch: targetBranch,
      ...(sha ? { sha } : {}),
    });
    const commitSha = data.commit?.sha || '';
    trackEvent('GitHubCommitSucceeded', {
      path,
      branch: targetBranch,
      sha: commitSha || data.content?.sha || '',
    });
    return {
      path,
      branch: targetBranch,
      sha: data.content?.sha,
      commitSha,
    };
  } catch (err) {
    trackEvent('GitHubCommitFailed', {
      path,
      branch: targetBranch,
      error: err.message || String(err),
    });
    throw err;
  }
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
