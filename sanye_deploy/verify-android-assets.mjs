#!/usr/bin/env node
// 安卓交付资源一致性门禁（CI：android-check；本地：交付脚本调用）：
// 包内 `android/app/src/main/assets/public` 必须与 `sanye_client/dist-android` 逐文件一致。
//
// 背景：安卓交付链路是 generate-catalog → build:android → cap sync → gradle。只跑
// `build:android` 与 gradle 而不跑 `cap sync` 时，包内页面资源会停留在上一次同步，
// 打出来的包看起来构建成功、实际带的是旧页面（本轮本地交付就发出过一个带
// 2026-09-30 旧资源的中间产物，靠这条比对才发现）。Capacitor 自己生成的
// `cordova.js` 与 `cordova_plugins.js` 不在前端构建产物里，按约定忽略。
//
// 用法：
//   node sanye_deploy/verify-android-assets.mjs [--dist <目录>] [--packaged <目录>]
// 退出码：0 一致；1 不一致；2 目录缺失。
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** 默认比对的两个目录；CI 与本地交付脚本都用这一对。 */
export const defaultDirs = {
  dist: path.join(repoRoot, 'sanye_client', 'dist-android'),
  packaged: path.join(repoRoot, 'sanye_android', 'android', 'app', 'src', 'main', 'assets', 'public'),
}

/** Capacitor 生成、不在前端构建产物里的文件，按约定忽略。 */
export const ignoredFiles = new Set(['cordova.js', 'cordova_plugins.js'])

/** 递归列出目录下所有文件，返回以 `/` 分隔的相对路径（已排序、已过滤忽略项）。 */
export function listFiles(root, { ignore = ignoredFiles } = {}) {
  const found = []
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative)
      else if (!ignore.has(relative)) found.push(relative)
    }
  }
  walk(root, '')
  return found.sort()
}

/** 计算文件 SHA-256。 */
export function hashFile(absolute) {
  return createHash('sha256').update(readFileSync(absolute)).digest('hex')
}

/**
 * 比对两棵资源树。
 * - `missingInPackaged`：前端构建有、包内没有（没同步或同步不全）
 * - `extraInPackaged`：包内有、前端构建没有（旧构建残留）
 * - `changed`：同名但内容不同（同样是旧构建）
 */
export function compareAssetTrees(distRoot, packagedRoot, options = {}) {
  const distFiles = listFiles(distRoot, options)
  const packagedFiles = listFiles(packagedRoot, options)
  const packagedSet = new Set(packagedFiles)
  const distSet = new Set(distFiles)
  return {
    distFiles,
    packagedFiles,
    missingInPackaged: distFiles.filter((file) => !packagedSet.has(file)),
    extraInPackaged: packagedFiles.filter((file) => !distSet.has(file)),
    changed: distFiles.filter(
      (file) => packagedSet.has(file) && hashFile(path.join(distRoot, file)) !== hashFile(path.join(packagedRoot, file)),
    ),
  }
}

/** 判定是否一致。 */
export function assetsMatch(result) {
  return result.missingInPackaged.length === 0 && result.extraInPackaged.length === 0 && result.changed.length === 0
}

/** 生成中文结论文本。 */
export function formatAssetReport(result, { distRoot, packagedRoot } = {}) {
  const lines = [
    '安卓交付资源一致性：包内 assets/public 与前端构建产物比对',
    `  前端构建：${distRoot}`,
    `  包内资源：${packagedRoot}`,
    `  文件数：前端 ${result.distFiles.length} 个 / 包内 ${result.packagedFiles.length} 个`,
  ]
  if (assetsMatch(result)) {
    lines.push('  结论：逐文件 SHA-256 一致，包内页面资源就是当前构建。')
    return lines.join('\n')
  }
  if (result.missingInPackaged.length) {
    lines.push(`  包内缺失（前端有、包内没有，多半是漏跑 cap sync）：${result.missingInPackaged.length} 个`)
    for (const file of result.missingInPackaged.slice(0, 20)) lines.push(`    - ${file}`)
  }
  if (result.extraInPackaged.length) {
    lines.push(`  包内多余（前端没有、包内残留，多半是旧构建）：${result.extraInPackaged.length} 个`)
    for (const file of result.extraInPackaged.slice(0, 20)) lines.push(`    - ${file}`)
  }
  if (result.changed.length) {
    lines.push(`  同名但内容不同（旧构建残留）：${result.changed.length} 个`)
    for (const file of result.changed.slice(0, 20)) lines.push(`    - ${file}`)
  }
  lines.push('  结论：包内页面资源与前端构建不一致，先跑 `pnpm --filter @sanye/sanye_client build:android` 与 `cd sanye_android && npm run sync` 再打包。')
  return lines.join('\n')
}

function parseArgs(argv) {
  const options = { dist: defaultDirs.dist, packaged: defaultDirs.packaged }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--dist') options.dist = path.resolve(argv[index + 1])
    else if (flag === '--packaged') options.packaged = path.resolve(argv[index + 1])
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  try {
    const result = compareAssetTrees(options.dist, options.packaged)
    console.log(formatAssetReport(result, { distRoot: options.dist, packagedRoot: options.packaged }))
    process.exit(assetsMatch(result) ? 0 : 1)
  } catch (error) {
    console.error(`安卓交付资源一致性门禁无法完成：${error.message}`)
    process.exit(2)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
