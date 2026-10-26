import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function requireCi(runs, commit, branch, { workflow = 'ci.yml', now = Date.now(), events = ['push'] } = {}) {
  const matching = runs.filter(run => run.head_sha === commit && run.head_branch === branch && events.includes(run.event));
  matching.sort((a, b) => b.id - a.id || (b.run_attempt ?? 1) - (a.run_attempt ?? 1));
  const latest = matching[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new Error(workflow + ': Latest CI for this exact commit and branch must succeed (status: ' + (latest?.status ?? 'missing') + ', conclusion: ' + (latest?.conclusion ?? 'missing') + ')');
  const updated = Date.parse(latest.updated_at);
  if (!Number.isFinite(updated) || updated > now || now - updated > 7 * 24 * 60 * 60 * 1000) throw new Error(workflow + ': Successful CI evidence is expired or has an invalid timestamp; rerun the workflow');
  return latest.id;
}

export const candidateWorkflows = ['ci.yml', 'android-check.yml', 'desktop-check.yml'];
export function requireCandidateCi(evidence, commit, branch, { now = Date.now() } = {}) {
  return Object.fromEntries(candidateWorkflows.map(workflow => [workflow, requireCi(evidence[workflow] ?? [], commit, branch, {
    workflow, now, events: workflow === 'ci.yml' ? ['push'] : ['push', 'workflow_dispatch'],
  })]));
}

export async function workflowRuns(repo, workflow, commit, token, request = fetch) {
  const runs = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = new URL('https://api.github.com/repos/' + repo + '/actions/workflows/' + workflow + '/runs');
    url.searchParams.set('head_sha', commit); url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
    const response = await request(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(workflow + ': CI lookup failed: HTTP ' + response.status);
    const batch = (await response.json()).workflow_runs;
    if (!Array.isArray(batch)) throw new Error(workflow + ': Invalid CI lookup response');
    runs.push(...batch);
    if (batch.length < 100) return runs;
  }
  throw new Error(workflow + ': Too many candidate CI runs; lookup incomplete');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { GITHUB_REPOSITORY: repo, GITHUB_SHA: commit, GITHUB_REF_NAME: branch, GH_TOKEN: token } = process.env;
    if (!token || !repo || !branch || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('GitHub candidate context required');
    const evidence = {};
    for (const workflow of candidateWorkflows) evidence[workflow] = await workflowRuns(repo, workflow, commit, token);
    const accepted = requireCandidateCi(evidence, commit, branch);
    for (const [workflow, run] of Object.entries(accepted)) console.log(workflow + ': Candidate CI run ' + run);

  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
