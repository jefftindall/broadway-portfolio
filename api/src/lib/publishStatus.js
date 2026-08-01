import { getOctokit, repoInfo } from './github.js';

const WORKFLOW_FILE = 'azure-static-web-apps.yml';

/**
 * Normalize a workflow / job status for the Studio UI.
 * @param {string | null | undefined} status
 * @param {string | null | undefined} conclusion
 * @returns {'queued'|'in_progress'|'success'|'failure'|'skipped'|'unknown'}
 */
export function normalizeRunStatus(status, conclusion) {
  if (conclusion === 'success') return 'success';
  if (conclusion === 'skipped' || conclusion === 'neutral') return 'skipped';
  if (
    conclusion === 'failure' ||
    conclusion === 'cancelled' ||
    conclusion === 'timed_out' ||
    conclusion === 'startup_failure'
  ) {
    return 'failure';
  }
  if (status === 'queued' || status === 'pending' || status === 'waiting' || status === 'requested') {
    return 'queued';
  }
  if (status === 'in_progress' || status === 'action_required') return 'in_progress';
  if (status === 'completed' && !conclusion) return 'unknown';
  return 'unknown';
}

/**
 * Look up GitHub Actions deploy progress for a commit SHA.
 * @param {string} sha
 */
export async function getPublishPipelineStatus(sha) {
  const commitSha = String(sha || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    const err = new Error('Invalid commit sha');
    err.status = 400;
    throw err;
  }

  const octokit = getOctokit();
  const { owner, repo } = repoInfo();

  const { data: runsData } = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: commitSha,
    per_page: 10,
  });

  const runs = Array.isArray(runsData.workflow_runs) ? runsData.workflow_runs : [];
  const preferred =
    runs.find((r) => String(r.path || '').endsWith(WORKFLOW_FILE)) || runs[0] || null;

  if (!preferred) {
    return {
      sha: commitSha,
      status: 'queued',
      runUrl: null,
      jobs: [],
    };
  }

  let jobs = [];
  try {
    const { data: jobsData } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: preferred.id,
      per_page: 50,
    });
    jobs = (jobsData.jobs || []).map((job) => ({
      name: job.name,
      status: normalizeRunStatus(job.status, job.conclusion),
      conclusion: job.conclusion || null,
    }));
  } catch {
    jobs = [];
  }

  return {
    sha: commitSha,
    status: normalizeRunStatus(preferred.status, preferred.conclusion),
    runUrl: preferred.html_url || null,
    jobs,
  };
}
