#!/usr/bin/env node
// 依赖漏洞门禁：语义与同一作业里的 Trivy 对齐——忽略「上游没有修复版本」的告警，
// 但这类条目必须先登记在 audit-exemptions.json 里（含原因与复核期限），
// 其余高危/严重告警一律阻断，只能靠升级依赖解决。
//
// 用法：
//   node sanye_deploy/audit-dependencies.mjs                # 现场执行 pnpm audit --json
//   node sanye_deploy/audit-dependencies.mjs --report x.json # 复用已保存的审计 JSON（离线复核）
//   node sanye_deploy/audit-dependencies.mjs --strict        # 发行时不允许高危/严重风险豁免
// 退出码：0 通过；1 存在阻断项、豁免过期或豁免失效；2 审计本身无法执行或无法解析。

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** 门禁阻断的严重度；低于该级别的告警只提示，不阻断。 */
export const blockingSeverities = ['high', 'critical']

/** 上游没有修复版本的标记，pnpm/npm audit 用 `<0.0.0` 表示。 */
export const unfixedRange = '<0.0.0'

const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 }

/** 解析 `pnpm audit --json` 输出；兼容 PowerShell 写入的 BOM。 */
export function parseAudit(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('审计输出为空，无法解析')
  const parsed = JSON.parse(text)
  validateAudit(parsed)
  return parsed
}

function validateAudit(audit) {
  if (!audit || !audit.advisories || typeof audit.advisories !== 'object' || Array.isArray(audit.advisories)) {
    throw new Error('审计输出缺少 advisories 对象，不能认定扫描完成')
  }
  for (const advisory of Object.values(audit.advisories)) {
    if (!advisory || !advisory.module_name || !(advisory.github_advisory_id || advisory.id)
        || !['critical', 'high', 'moderate', 'low', 'info'].includes(advisory.severity)
        || typeof advisory.patched_versions !== 'string') throw new Error('审计告警记录不完整，不能跳过未知风险')
  }
}

/** 读取豁免登记；缺少文件时返回空登记（门禁仍然生效，只是没有任何豁免）。 */
export function loadExemptions(file = path.join(here, 'audit-exemptions.json')) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.exemptions)) throw new Error('豁免登记缺少 exemptions 数组')
  const exemptions = parsed.exemptions
  const keys = new Set()
  for (const entry of exemptions) {
    if (!entry || typeof entry.advisory !== 'string' || !entry.advisory) throw new Error('豁免登记缺少 advisory 字段')
    if (typeof entry.package !== 'string' || !entry.package) throw new Error(`豁免 ${entry.advisory} 缺少 package 字段`)
    if (!entry.reason?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy ?? '')
        || !Number.isFinite(Date.parse(entry.reviewBy))) throw new Error(`豁免 ${entry.advisory} 缺少有效原因或复核期限`)
    const key = `${entry.source ?? 'pnpm'}|${entry.advisory}|${entry.package}`
    if (keys.has(key)) throw new Error(`豁免登记重复：${entry.advisory} ${entry.package}`)
    keys.add(key)
  }
  return exemptions
}

function isUnfixed(advisory) {
  return String(advisory.patched_versions ?? '').trim() === unfixedRange
}

function pathsOf(advisory) {
  return Object.values(advisory.findings ?? {}).flatMap((finding) => finding.paths ?? [])
}

function dayStart(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * 判定审计结果。
 * 放行条件：告警严重度低于门禁阈值，或该告警「上游无修复版本」且已在豁免登记里、包名一致、未过复核期限。
 */
export function analyzeAudit(audit, exemptions, { today = new Date(), strict = false } = {}) {
  validateAudit(audit)
  const advisories = Object.values(audit?.advisories ?? {})
  // 登记文件与 Trivy 门禁共用：这里只认 pnpm 来源（缺省即 pnpm）的登记项。
  const scoped = exemptions.filter((entry) => !entry.source || entry.source === 'pnpm')
  const byAdvisory = new Map(scoped.map((entry) => [entry.advisory, entry]))
  const used = new Set()
  const blocking = []
  const exempted = []
  const expired = []
  const belowGateUnfixed = []
  const belowGateFixable = []
  const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }

  for (const advisory of advisories) {
    const severity = String(advisory.severity ?? 'info').toLowerCase()
    counts[severity] = (counts[severity] ?? 0) + 1
    const record = {
      advisory: advisory.github_advisory_id || String(advisory.id ?? ''),
      package: advisory.module_name,
      severity,
      patched: String(advisory.patched_versions ?? ''),
      title: advisory.title ?? '',
      url: advisory.url ?? '',
      paths: pathsOf(advisory),
    }
    const entry = byAdvisory.get(record.advisory)
    if (entry) used.add(entry.advisory)
    const isBlockingSeverity = blockingSeverities.includes(severity)

    if (isUnfixed(advisory) && entry) {
      if (entry.package !== record.package) {
        blocking.push({ ...record, reason: `豁免登记的包名是 ${entry.package}，与审计结果不符` })
        continue
      }
      const reviewBy = Date.parse(entry.reviewBy ?? '')
      if (!Number.isFinite(reviewBy)) {
        expired.push({ ...record, reviewBy: entry.reviewBy ?? '', reason: '豁免登记缺少可解析的 reviewBy' })
      } else if (reviewBy < dayStart(today)) {
        expired.push({ ...record, reviewBy: entry.reviewBy, reason: '豁免已过复核期限，需重新评估' })
      } else if (strict && isBlockingSeverity) {
        blocking.push({ ...record, reason: '严格发行门禁禁止带高危或严重漏洞风险发布，登记不替代修复' })
      } else {
        exempted.push({ ...record, reviewBy: entry.reviewBy, reason: entry.reason ?? '' })
      }
      continue
    }

    if (isBlockingSeverity) {
      blocking.push({
        ...record,
        reason: isUnfixed(advisory) ? '上游无修复版本，但未在 audit-exemptions.json 登记' : `可升级到 ${record.patched} 修复`,
      })
      continue
    }

    if (isUnfixed(advisory)) belowGateUnfixed.push(record)
    else belowGateFixable.push(record)
  }

  const stale = scoped.filter((entry) => !used.has(entry.advisory))
  const sorted = (items) => [...items].sort((left, right) => (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9) || String(left.package).localeCompare(String(right.package)))

  return {
    total: advisories.length,
    counts,
    blocking: sorted(blocking),
    exempted: sorted(exempted),
    expired: sorted(expired),
    belowGateUnfixed: sorted(belowGateUnfixed),
    belowGateFixable: sorted(belowGateFixable),
    stale,
  }
}

export function formatReport(result, { today = new Date() } = {}) {
  const lines = []
  const counts = result.counts
  lines.push(`依赖漏洞门禁：共 ${result.total} 条告警（严重 ${counts.critical ?? 0} / 高危 ${counts.high ?? 0} / 中等 ${counts.moderate ?? 0} / 低 ${counts.low ?? 0}）`)
  const describe = (item) => `[${item.severity}] ${item.package} ${item.advisory}｜${item.reason}｜${item.paths[0] ?? '-'}`
  lines.push(`  阻断项：${result.blocking.length} 条`)
  for (const item of result.blocking) lines.push(`    - ${describe(item)}`)
  lines.push(`  登记豁免（上游无修复）：${result.exempted.length} 条`)
  for (const item of result.exempted) lines.push(`    - ${describe(item)}｜复核期限 ${item.reviewBy}`)
  lines.push(`  豁免过期：${result.expired.length} 条`)
  for (const item of result.expired) lines.push(`    - ${describe(item)}`)
  lines.push(`  失效豁免（审计结果里已不存在）：${result.stale.length} 条`)
  for (const entry of result.stale) lines.push(`    - ${entry.advisory}（${entry.package}）`)
  lines.push(`  低于门禁阈值且上游无修复（仅提示）：${result.belowGateUnfixed.length} 条`)
  for (const item of result.belowGateUnfixed) lines.push(`    - [${item.severity}] ${item.package} ${item.advisory}`)
  lines.push(`  低于门禁阈值但可升级修复（仅提示）：${result.belowGateFixable.length} 条`)
  for (const item of result.belowGateFixable) lines.push(`    - [${item.severity}] ${item.package} ${item.advisory} → ${item.patched}`)
  lines.push(`复核日期：${dayIso(today)}`)
  const passed = result.blocking.length === 0 && result.expired.length === 0 && result.stale.length === 0
  lines.push(passed ? `依赖漏洞门禁通过：高危/严重阻断项为 0，仍有 ${result.exempted.length} 条已登记风险；不代表不存在漏洞。` : '依赖漏洞门禁失败：见上方阻断项／豁免过期／失效豁免。')
  return { text: lines.join('\n'), passed }
}

function dayIso(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function runAudit() {
  const result = spawnSync('pnpm', ['audit', '--json'], {
    cwd: root,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw new Error(`无法执行 pnpm audit：${result.error.message}`)
  const status = result.status ?? 0
  if (status > 1) throw new Error(`pnpm audit 异常退出（exit ${status}）：${(result.stderr ?? '').slice(0, 2000)}`)
  return result.stdout ?? ''
}

function main() {
  const argv = process.argv.slice(2)
  const reportIndex = argv.findIndex((item) => item === '--report')
  const reportPath = reportIndex >= 0 ? argv[reportIndex + 1] : null
  if (reportIndex >= 0 && !reportPath) {
    console.error('--report 需要一个 JSON 文件路径')
    process.exit(2)
    return
  }
  try {
    const raw = reportPath ? readFileSync(path.resolve(reportPath), 'utf8') : runAudit()
    const audit = parseAudit(raw)
    const result = analyzeAudit(audit, loadExemptions(), { strict: argv.includes('--strict') })
    const report = formatReport(result)
    console.log(report.text)
    process.exit(report.passed ? 0 : 1)
  } catch (error) {
    console.error(`依赖漏洞门禁无法完成：${error.message}`)
    process.exit(2)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
