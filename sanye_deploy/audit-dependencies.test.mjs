import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { analyzeAudit, formatReport, loadExemptions, parseAudit } from './audit-dependencies.mjs'

function advisory(overrides = {}) {
  return {
    id: 1,
    github_advisory_id: 'GHSA-test-0000-0000',
    module_name: 'left-pad',
    severity: 'high',
    patched_versions: '>=1.3.0',
    vulnerable_versions: '<1.3.0',
    title: '测试告警',
    url: 'https://github.com/advisories/GHSA-test-0000-0000',
    findings: [{ paths: ['sanye_desktop>left-pad'] }],
    ...overrides,
  }
}

function auditOf(...advisories) {
  return { advisories: Object.fromEntries(advisories.map((item, index) => [String(index + 1), item])) }
}

const future = '2027-01-10'
const today = new Date('2026-10-10T09:00:00Z')

test('解析审计输出时容错 PowerShell 写入的 BOM', () => {
  const parsed = parseAudit('\uFEFF{"advisories":{}}')
  assert.deepEqual(parsed, { advisories: {} })
})

test('只有低于门禁阈值的告警时通过', () => {
  const result = analyzeAudit(auditOf(advisory({ severity: 'moderate' })), [], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(result.belowGateFixable.length, 1)
  assert.equal(formatReport(result, { today }).passed, true)
})

test('存在高危告警即阻断，并同时给出可升级修复的记录', () => {
  const result = analyzeAudit(auditOf(advisory()), [], { today })
  assert.equal(result.blocking.length, 1)
  assert.equal(result.belowGateFixable.length, 0)
  assert.equal(result.exempted.length, 0)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('可升级修复的高危告警阻断并给出修复版本', () => {
  const result = analyzeAudit(auditOf(advisory({ patched_versions: '>=1.3.1' })), [], { today })
  assert.equal(result.blocking.length, 1)
  assert.match(result.blocking[0].reason, />=1\.3\.1/)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('上游无修复但已登记且未过期时放行', () => {
  const item = advisory({ patched_versions: '<0.0.0' })
  const result = analyzeAudit(auditOf(item), [{ advisory: item.github_advisory_id, package: item.module_name, severity: 'high', reason: '上游无修复', reviewBy: future }], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(result.exempted.length, 1)
  assert.equal(result.exempted[0].reviewBy, future)
  assert.equal(formatReport(result, { today }).passed, true)
})

test('上游无修复却未登记时阻断', () => {
  const result = analyzeAudit(auditOf(advisory({ patched_versions: '<0.0.0' })), [], { today })
  assert.equal(result.blocking.length, 1)
  assert.match(result.blocking[0].reason, /未在 audit-exemptions\.json 登记/)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('豁免过了复核期限时阻断', () => {
  const item = advisory({ patched_versions: '<0.0.0' })
  const result = analyzeAudit(auditOf(item), [{ advisory: item.github_advisory_id, package: item.module_name, severity: 'high', reason: '上游无修复', reviewBy: '2026-09-30' }], { today })
  assert.equal(result.expired.length, 1)
  assert.equal(result.blocking.length, 0)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('豁免登记的包名与审计结果不符时阻断', () => {
  const item = advisory({ patched_versions: '<0.0.0' })
  const result = analyzeAudit(auditOf(item), [{ advisory: item.github_advisory_id, package: 'other-package', severity: 'high', reason: '错配', reviewBy: future }], { today })
  assert.equal(result.blocking.length, 1)
  assert.match(result.blocking[0].reason, /包名/)
})

test('审计结果里已不存在的登记项判为失效', () => {
  const result = analyzeAudit(auditOf(), [{ advisory: 'GHSA-gone-0000-0000', package: 'gone', severity: 'high', reason: '历史登记', reviewBy: future }], { today })
  assert.equal(result.stale.length, 1)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('低于门禁阈值且上游无修复的告警只提示不阻断', () => {
  const result = analyzeAudit(auditOf(advisory({ severity: 'moderate', patched_versions: '<0.0.0' })), [], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(result.belowGateUnfixed.length, 1)
  assert.equal(formatReport(result, { today }).passed, true)
})

test('缺 reviewBy 的登记项按过期处理', () => {
  const item = advisory({ patched_versions: '<0.0.0' })
  const result = analyzeAudit(auditOf(item), [{ advisory: item.github_advisory_id, package: item.module_name, severity: 'high', reason: '上游无修复' }], { today })
  assert.equal(result.expired.length, 1)
  assert.equal(formatReport(result, { today }).passed, false)
})

test('读取真实豁免登记文件并校验必填字段', async () => {
  const exemptions = loadExemptions()
  assert.ok(exemptions.length >= 1)
  for (const entry of exemptions) {
    assert.ok(entry.advisory && entry.package && entry.reason && entry.reviewBy, `豁免 ${entry.advisory} 字段不完整`)
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sanye-audit-exemptions-'))
  const broken = path.join(directory, 'broken.json')
  await writeFile(broken, JSON.stringify({ exemptions: [{ package: 'x', reason: 'y' }] }))
  assert.throws(() => loadExemptions(broken), /缺少 advisory/)
})

test('当前登记能覆盖审计报告里上游无修复的高危/严重告警', async () => {
  // 真实报告存在时（本机或 CI 落盘）用它复核登记是否仍然对齐；不存在则跳过。
  const { existsSync, readFileSync } = await import('node:fs')
  const reportPath = path.join(process.cwd(), 'audit-report.json')
  if (!existsSync(reportPath)) return
  const result = analyzeAudit(parseAudit(readFileSync(reportPath, 'utf8')), loadExemptions(), { today })
  assert.equal(result.blocking.length, 0, `存在未登记的阻断告警：${result.blocking.map((item) => `${item.package} ${item.advisory}`).join('、')}`)
  assert.equal(result.expired.length, 0)
  assert.equal(result.stale.length, 0)
})
