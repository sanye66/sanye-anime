#!/usr/bin/env node
// 文件系统漏洞门禁（CI：ci.yml 的 dependency-scan 作业，Trivy fs 扫描）：
// 与 `pnpm audit:deps` 共用 sanye_deploy/audit-exemptions.json，
// 只为「可升级修复」的高危/严重命中阻断；上游没有回补版本的条目（例如只在
// 更高主版本修复）必须登记并写明原因与复核期限才放行。
//
// 用法：
//   node sanye_deploy/audit-trivy.mjs --report trivy-report.json [--conclusion trivy-conclusion.txt] [--strict]
// 退出码：0 通过；1 存在阻断项、豁免过期或豁免失效；2 报告缺失／无法解析。

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadExemptions } from './audit-dependencies.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 门禁阻断的严重度；低于该级别的命中只提示，不阻断。 */
export const blockingSeverities = ['high', 'critical']

/** 解析 Trivy JSON 报告；兼容 PowerShell 写入的 BOM。 */
export function parseTrivy(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('Trivy 报告为空，无法解析')
  const parsed = JSON.parse(text)
  validateTrivy(parsed)
  return parsed
}

function validateTrivy(report) {
  if (!report || !Array.isArray(report.Results)) throw new Error('Trivy 报告缺少 Results 数组，不能认定扫描完成')
  for (const result of report.Results) {
    if (!result || typeof result.Target !== 'string' || !result.Target.trim()) throw new Error('Trivy 扫描目标无效')
    if (result.Vulnerabilities !== undefined && !Array.isArray(result.Vulnerabilities)) throw new Error('Trivy 漏洞列表无效')
    for (const item of result.Vulnerabilities ?? []) {
      if (!item || !item.VulnerabilityID || !item.PkgName || !item.InstalledVersion
          || !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(item.Severity)) {
        throw new Error('Trivy 漏洞记录不完整，不能跳过未知风险')
      }
    }
  }
}

function dayStart(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * 判定 Trivy 报告。同一个 CVE 会在多个 target（各模块 pom／fat jar）里重复出现，
 * 先按「漏洞 ID + 包名 + 已安装版本」去重，再逐条判定，避免报告被重复行淹没。
 */
export function analyzeTrivy(report, exemptions, { today = new Date(), strict = false } = {}) {
  validateTrivy(report)
  const findings = new Map()
  for (const result of report?.Results ?? []) {
    for (const item of result?.Vulnerabilities ?? []) {
      const severity = String(item.Severity ?? 'unknown').toLowerCase()
      const key = `${item.VulnerabilityID}|${item.PkgName}|${item.InstalledVersion}`
      const existing = findings.get(key)
      if (existing) {
        existing.targets.add(result.Target)
        continue
      }
      findings.set(key, {
        advisory: String(item.VulnerabilityID ?? ''),
        package: String(item.PkgName ?? ''),
        installed: String(item.InstalledVersion ?? ''),
        fixed: String(item.FixedVersion ?? ''),
        severity,
        title: item.Title ?? '',
        url: item.PrimaryURL ?? '',
        targets: new Set([result.Target]),
      })
    }
  }

  const trivyExemptions = exemptions.filter((entry) => entry.source === 'trivy')
  // 同一 CVE 可能同时命中多个包（例如 CVE-2026-47890 既在 spring-webmvc 也在
  // spring-webflux），登记项因此按「漏洞 ID + 包名」配对，同名包各登记一条。
  const exemptionKey = (entry) => `${entry.advisory}|${entry.package}`
  const byKey = new Map(trivyExemptions.map((entry) => [exemptionKey(entry), entry]))
  const used = new Set()
  const counts = {}
  const blocking = []
  const exempted = []
  const expired = []
  const informational = []

  for (const finding of findings.values()) {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1
    const record = { ...finding, targets: [...finding.targets].sort() }
    if (!blockingSeverities.includes(finding.severity)) {
      informational.push(record)
      continue
    }
    const key = `${finding.advisory}|${finding.package}`
    const entry = byKey.get(key)
    if (!entry) {
      blocking.push({ ...record, reason: record.fixed ? `可升级到 ${record.fixed} 修复，或为「仅在更高主版本修复」的命中登记豁免` : '上游无修复版本，且未登记豁免' })
      continue
    }
    used.add(key)
    if (!Array.isArray(entry.installedVersions) || !entry.installedVersions.includes(record.installed)) {
      blocking.push({ ...record, reason: '当前安装版本不在已评审豁免范围，必须重新评估' })
      continue
    }
    if (record.fixed && (!Array.isArray(entry.reviewedFixedVersions) || !entry.reviewedFixedVersions.includes(record.fixed))) {
      blocking.push({ ...record, reason: `发现未经评审的修复版本 ${record.fixed}，不能沿用旧豁免` })
      continue
    }
    if (entry.severity !== record.severity) {
      blocking.push({ ...record, reason: '严重度发生变化，必须重新评估豁免' })
      continue
    }
    const reviewBy = Date.parse(entry.reviewBy ?? '')
    if (!Number.isFinite(reviewBy)) {
      expired.push({ ...record, reviewBy: entry.reviewBy ?? '', reason: '豁免登记缺少可解析的 reviewBy' })
    } else if (reviewBy < dayStart(today)) {
      expired.push({ ...record, reviewBy: entry.reviewBy, reason: '豁免已过复核期限，需重新评估' })
    } else if (strict) {
      blocking.push({ ...record, reason: '严格发行门禁禁止带高危或严重漏洞风险发布，登记不替代修复' })
    } else {
      exempted.push({ ...record, reviewBy: entry.reviewBy, reason: entry.reason ?? '' })
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
  const sorted = (items) => [...items].sort((left, right) => (order[left.severity] ?? 9) - (order[right.severity] ?? 9) || String(left.package).localeCompare(String(right.package)) || String(left.advisory).localeCompare(String(right.advisory)))

  return {
    totalRows: [...findings.values()].reduce((sum, item) => sum + item.targets.size, 0),
    unique: findings.size,
    counts,
    blocking: sorted(blocking),
    exempted: sorted(exempted),
    expired: sorted(expired),
    informational: sorted(informational),
    stale: trivyExemptions.filter((entry) => !used.has(exemptionKey(entry))),
  }
}

export function formatTrivyReport(result, { today = new Date() } = {}) {
  const lines = []
  const counts = result.counts
  lines.push(`文件系统漏洞门禁：${result.unique} 条唯一命中（去重前 ${result.totalRows} 条；严重 ${counts.critical ?? 0} / 高危 ${counts.high ?? 0} / 中等 ${counts.medium ?? 0} / 未知 ${counts.unknown ?? 0}）`)
  const describe = (item) => `[${item.severity}] ${item.package} ${item.advisory}（已安装 ${item.installed}${item.fixed ? ` → 修复 ${item.fixed}` : '，上游无修复'}）｜${item.reason}｜命中 ${item.targets.length} 个 target，例如 ${item.targets[0]}`
  lines.push(`  阻断项：${result.blocking.length} 条`)
  for (const item of result.blocking) lines.push(`    - ${describe(item)}`)
  lines.push(`  登记豁免：${result.exempted.length} 条`)
  for (const item of result.exempted) lines.push(`    - ${describe(item)}｜复核期限 ${item.reviewBy}`)
  lines.push(`  豁免过期：${result.expired.length} 条`)
  for (const item of result.expired) lines.push(`    - ${describe(item)}`)
  lines.push(`  失效豁免（扫描结果里已不存在）：${result.stale.length} 条`)
  for (const entry of result.stale) lines.push(`    - ${entry.advisory}（${entry.package}）`)
  lines.push(`  低于门禁阈值（仅提示）：${result.informational.length} 条`)
  for (const item of result.informational) lines.push(`    - [${item.severity}] ${item.package} ${item.advisory}（已安装 ${item.installed}）`)
  const passed = result.blocking.length === 0 && result.expired.length === 0 && result.stale.length === 0
  lines.push(passed ? `文件系统漏洞门禁通过：高危/严重阻断项为 0，仍有 ${result.exempted.length} 条已登记风险；不代表不存在漏洞。` : '文件系统漏洞门禁失败：见上方阻断项／豁免过期／失效豁免。')
  return { text: lines.join('\n'), passed }
}

function argValue(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : null
}

function main() {
  const argv = process.argv.slice(2)
  const reportPath = argValue(argv, '--report') ?? path.join(process.cwd(), 'trivy-report.json')
  const conclusionPath = argValue(argv, '--conclusion')
  try {
    const report = parseTrivy(readFileSync(reportPath, 'utf8'))
    const result = analyzeTrivy(report, loadExemptions(), { strict: argv.includes('--strict') })
    const formatted = formatTrivyReport(result)
    console.log(formatted.text)
    if (conclusionPath) writeFileSync(conclusionPath, `${formatted.text}\n`, 'utf8')
    process.exit(formatted.passed ? 0 : 1)
  } catch (error) {
    const message = `文件系统漏洞门禁无法完成：${error.message}`
    console.error(message)
    if (conclusionPath) {
      try {
        writeFileSync(conclusionPath, `${message}\n`, 'utf8')
      } catch {}
    }
    process.exit(2)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
