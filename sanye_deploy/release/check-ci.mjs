import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function requireCi(runs, commit, branch) {
  const matching = runs.filter(run => run.head_sha === commit && run.head_branch === branch && run.event === 'push');
  matching.sort((a, b) => b.id - a.id);
  if (!matching.length || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') throw new Error('Latest push CI for this exact commit and branch must succeed');
  return matching[0].id;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { GITHUB_REPOSITORY: repo, GITHUB_SHA: commit, GITHUB_REF_NAME: branch, GH_TOKEN: token } = process.env;
  if (!token || !repo || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('GitHub candidate context required');
  const url = new URL(`https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs`);
  url.searchParams.set('head_sha', commit); url.searchParams.set('per_page', '100');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`CI lookup failed: HTTP ${response.status}`);
  console.log(`Candidate CI run: ${requireCi((await response.json()).workflow_runs, commit, branch)}`);
}
