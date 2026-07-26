import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

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

export async function getFileSha(path) {
  const octokit = getOctokit();
  const { owner, repo, branch } = repoInfo();
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
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
 * @param {{ path: string, content: string | Buffer, message: string, binary?: boolean }} opts
 */
export async function commitFile({ path, content, message, binary = false }) {
  const octokit = getOctokit();
  const { owner, repo, branch } = repoInfo();
  const sha = await getFileSha(path);
  const contentBase64 = binary
    ? Buffer.isBuffer(content)
      ? content.toString('base64')
      : String(content)
    : Buffer.from(content, 'utf8').toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: contentBase64,
    branch,
    ...(sha ? { sha } : {}),
  });

  return { path, branch };
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
