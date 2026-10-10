import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredChecks = ['文档一致性检查', '前端类型检查与构建', '后端编译与测试', '浏览器安全回归', '依赖漏洞扫描', '密钥与敏感信息扫描'];
export function checkProtection(protection) {
  const checks = protection.required_status_checks;
  const names = new Set([...(checks?.contexts ?? []), ...(checks?.checks ?? []).map(check => check.context)]);
  return checks?.strict === true && protection.enforce_admins?.enabled === true && requiredChecks.every(name => names.has(name));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repo, output] = process.argv.slice(2);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !output) throw new Error('Usage: check-remote.mjs <owner/repo> <new-report.json>');
  const token = process.env.GH_TOKEN;
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const report = { checkedAt: new Date().toISOString(), repo, authenticated: Boolean(token), branches: [], scope: 'Classic branch protection; ruleset-only policies require separate review', passed: true };
  for (const branch of ['dev', 'test', 'release']) {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/branches/${branch}/protection`, { headers, signal: AbortSignal.timeout(15000) });
      const passed = response.ok && checkProtection(await response.json());
      report.branches.push({ branch, httpStatus: response.status, passed });
      report.passed &&= passed;
    } catch { report.branches.push({ branch, passed: false, reason: 'request-failed' }); report.passed = false; }
  }
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(report.passed ? 'Required classic branch protection verified' : 'Remote branch protection not verified; consult report');
  if (!report.passed) process.exitCode = 1;
}
