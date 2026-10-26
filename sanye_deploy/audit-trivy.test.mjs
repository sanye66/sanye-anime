import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { analyzeTrivy, formatTrivyReport, parseTrivy } from './audit-trivy.mjs'
import { loadExemptions } from './audit-dependencies.mjs'

function vulnerability(overrides = {}) {
  return {
    VulnerabilityID: 'CVE-2026-00001',
    PkgName: 'org.springframework:spring-webmvc',
    InstalledVersion: '6.2.19',
    FixedVersion: '7.0.9',
    Severity: 'CRITICAL',
    Title: '测试命中',
    PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2026-00001',
    ...overrides,
  }
}

function reportOf(targets) {
  return {
    SchemaVersion: 2,
    Results: Object.entries(targets).map(([target, items]) => ({ Target: target, Class: 'lang-pkgs', Type: 'pom', Vulnerabilities: items })),
  }
}

const trivyExemption = {
  source: 'trivy',
  advisory: 'CVE-2026-00001',
  package: 'org.springframework:spring-webmvc',
  severity: 'critical',
  reason: '上游只在 7.x 修复',
  installedVersions: ['6.2.19'],
  reviewedFixedVersions: ['7.0.9'],
  reviewBy: '2027-01-10',
}
const today = new Date('2026-10-10T09:00:00Z')
const future = '2027-01-10'

test('解析 Trivy 报告时容错 PowerShell 写入的 BOM', () => {
  assert.deepEqual(parseTrivy('\uFEFF{"Results":[]}'), { Results: [] })
})

test('不完整或错误的扫描输出不能变成零漏洞报告', () => {
  for (const value of [{}, [], { error: '扫描失败' }, { Results: {} }, { Results: [{ Target: 'pom.xml', Vulnerabilities: {} }] }]) {
    assert.throws(() => parseTrivy(JSON.stringify(value)))
  }
  assert.throws(() => analyzeTrivy(reportOf({ 'pom.xml': [vulnerability({ Severity: undefined })] }), [], { today }))
})

test('新安装版本或新修复版本不能继续使用旧豁免', () => {
  for (const item of [vulnerability({ InstalledVersion: '6.2.20' }), vulnerability({ FixedVersion: '6.2.20, 7.0.9' }), vulnerability({ Severity: 'HIGH' })]) {
    const result = analyzeTrivy(reportOf({ 'pom.xml': [item] }), [trivyExemption], { today })
    assert.equal(result.blocking.length, 1)
    assert.equal(result.exempted.length, 0)
  }
})

test('空报告直接通过', () => {
  const result = analyzeTrivy({ Results: [] }, [], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(formatTrivyReport(result, { today }).passed, true)
})

test('同一个 CVE 在多个 target 里只算一条唯一命中', () => {
  const report = reportOf({
    'sanye_server/pom.xml': [vulnerability()],
    'sanye_server/sanye-server-web/pom.xml': [vulnerability()],
    'sanye_server/sanye-server-anime/pom.xml': [vulnerability()],
  })
  const result = analyzeTrivy(report, [], { today })
  assert.equal(result.unique, 1)
  assert.equal(result.totalRows, 3)
  assert.equal(result.blocking.length, 1)
  assert.equal(result.blocking[0].targets.length, 3)
})

test('可升级修复的严重命中阻断并给出修复版本', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [], { today })
  assert.equal(result.blocking.length, 1)
  assert.match(result.blocking[0].reason, /7\.0\.9/)
  assert.equal(formatTrivyReport(result, { today }).passed, false)
})

test('已登记且未过期的 trivy 豁免放行', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [trivyExemption], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(result.exempted.length, 1)
  assert.equal(result.exempted[0].reviewBy, future)
  assert.equal(formatTrivyReport(result, { today }).passed, true)
})

test('严格发行门禁阻断已登记的高危和严重风险', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [trivyExemption], { today, strict: true })
  assert.equal(result.blocking.length, 1)
  assert.equal(result.exempted.length, 0)
  assert.equal(result.stale.length, 0)
  assert.equal(formatTrivyReport(result, { today }).passed, false)
})

test('豁免过期时阻断', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [{ ...trivyExemption, reviewBy: '2026-09-30' }], { today })
  assert.equal(result.expired.length, 1)
  assert.equal(formatTrivyReport(result, { today }).passed, false)
})

test('豁免登记的包名与命中不一致时不放行', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [{ ...trivyExemption, package: 'org.springframework:spring-webflux' }], { today })
  assert.equal(result.blocking.length, 1)
  assert.equal(result.exempted.length, 0)
  assert.equal(result.stale.length, 1)
})

test('同一 CVE 命中多个包时按包分别登记', () => {
  const report = reportOf({
    'a/pom.xml': [vulnerability()],
    'b/pom.xml': [vulnerability({ PkgName: 'org.springframework:spring-webflux' })],
  })
  const exemptions = [trivyExemption, { ...trivyExemption, package: 'org.springframework:spring-webflux' }]
  const result = analyzeTrivy(report, exemptions, { today })
  assert.equal(result.unique, 2)
  assert.equal(result.blocking.length, 0)
  assert.equal(result.exempted.length, 2)
  assert.equal(result.stale.length, 0)
  assert.equal(formatTrivyReport(result, { today }).passed, true)
})

test('扫描结果里已不存在的 trivy 豁免判为失效', () => {
  const result = analyzeTrivy({ Results: [] }, [trivyExemption], { today })
  assert.equal(result.stale.length, 1)
  assert.equal(formatTrivyReport(result, { today }).passed, false)
})

test('pnpm 来源的登记项不影响 trivy 门禁', () => {
  const pnpmEntry = { advisory: 'GHSA-xxxx-yyyy-zzzz', package: 'http-cache-semantics', severity: 'high', reason: 'pnpm 侧登记', reviewBy: future }
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability()] }), [pnpmEntry], { today })
  assert.equal(result.stale.length, 0)
  assert.equal(result.exempted.length, 0)
  assert.equal(result.blocking.length, 1)
})

test('低于门禁阈值的命中只提示不阻断', () => {
  const result = analyzeTrivy(reportOf({ 'pom.xml': [vulnerability({ Severity: 'MEDIUM' })] }), [], { today })
  assert.equal(result.blocking.length, 0)
  assert.equal(result.informational.length, 1)
  assert.equal(formatTrivyReport(result, { today }).passed, true)
})

test('真实报告存在时复核登记是否仍然对齐', t => {
  const reportPath = path.join(process.cwd(), 'trivy-report.json')
  if (!existsSync(reportPath)) { t.skip('未提供真实 Trivy 扫描报告，不能把夹具测试当作实际扫描'); return }
  const result = analyzeTrivy(parseTrivy(readFileSync(reportPath, 'utf8')), loadExemptions(), { today })
  assert.equal(result.blocking.length, 0, `存在未登记的阻断命中：${result.blocking.map((item) => `${item.package} ${item.advisory}`).join('、')}`)
  assert.equal(result.expired.length, 0)
  assert.equal(result.stale.length, 0)
})

test('真实豁免登记文件里 trivy 条目字段完整', () => {
  const trivyEntries = loadExemptions().filter((entry) => entry.source === 'trivy')
  assert.ok(trivyEntries.length >= 1)
  for (const entry of trivyEntries) {
    assert.match(entry.advisory, /^CVE-/, `${entry.advisory} 应为 CVE 编号`)
    assert.ok(entry.package && entry.reason && entry.reviewBy, `trivy 豁免 ${entry.advisory} 字段不完整`)
  }
})
