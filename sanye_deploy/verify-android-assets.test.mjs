#!/usr/bin/env node
// `sanye_deploy/verify-android-assets.mjs` 的单元测试：覆盖一致、漏同步、旧构建残留与
// 忽略 Capacitor 生成文件四种情况，外加真实仓库目录的自检。
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assetsMatch,
  compareAssetTrees,
  defaultDirs,
  formatAssetReport,
  ignoredFiles,
  listFiles,
} from './verify-android-assets.mjs'

/** 建一棵临时资源树并写入文件。 */
function makeTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'sanye-android-assets-'))
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(absolute, content, 'utf8')
  }
  return root
}

const trees = []
function tree(files) {
  const root = makeTree(files)
  trees.push(root)
  return root
}
test.after(() => {
  for (const root of trees) rmSync(root, { recursive: true, force: true })
})

test('一致的两棵树判定通过', () => {
  const dist = tree({ 'index.html': '<html>a</html>', 'assets/index-a.js': 'console.log(1)', 'assets/index-a.css': 'a{}' })
  const packed = tree({ 'index.html': '<html>a</html>', 'assets/index-a.js': 'console.log(1)', 'assets/index-a.css': 'a{}' })
  const result = compareAssetTrees(dist, packed)
  assert.equal(result.distFiles.length, 3)
  assert.deepEqual(result.missingInPackaged, [])
  assert.deepEqual(result.extraInPackaged, [])
  assert.deepEqual(result.changed, [])
  assert.equal(assetsMatch(result), true)
  assert.match(formatAssetReport(result, { distRoot: dist, packagedRoot: packed }), /逐文件 SHA-256 一致/)
})

test('漏跑 cap sync 时报告包内缺失', () => {
  const dist = tree({ 'index.html': 'new', 'assets/index-new.js': 'new' })
  const packed = tree({ 'index.html': 'old', 'assets/index-old.js': 'old' })
  const result = compareAssetTrees(dist, packed)
  assert.deepEqual(result.missingInPackaged, ['assets/index-new.js'])
  assert.deepEqual(result.extraInPackaged, ['assets/index-old.js'])
  assert.deepEqual(result.changed, ['index.html'])
  assert.equal(assetsMatch(result), false)
  const report = formatAssetReport(result, { distRoot: dist, packagedRoot: packed })
  assert.match(report, /包内缺失/)
  assert.match(report, /包内多余/)
  assert.match(report, /同名但内容不同/)
})

test('同名同大小但内容不同也算不一致', () => {
  const dist = tree({ 'assets/index.js': 'aaaa' })
  const packed = tree({ 'assets/index.js': 'bbbb' })
  assert.deepEqual(compareAssetTrees(dist, packed).changed, ['assets/index.js'])
})

test('Capacitor 生成的 cordova 文件按约定忽略', () => {
  const dist = tree({ 'index.html': 'same' })
  const packed = tree({ 'index.html': 'same', 'cordova.js': '', 'cordova_plugins.js': '' })
  const result = compareAssetTrees(dist, packed)
  assert.equal(assetsMatch(result), true)
  assert.deepEqual(result.extraInPackaged, [])
  assert.equal(ignoredFiles.has('cordova.js'), true)
})

test('嵌套目录逐层比对，路径统一为 / 分隔', () => {
  const dist = tree({ 'assets/nested/deep/chunk.js': 'x' })
  const packed = tree({ 'assets/nested/deep/chunk.js': 'y' })
  assert.deepEqual(listFiles(dist), ['assets/nested/deep/chunk.js'])
  assert.deepEqual(compareAssetTrees(dist, packed).changed, ['assets/nested/deep/chunk.js'])
})

test('目录不存在时抛错（CLI 退出码 2 的路径）', () => {
  const dist = tree({ 'index.html': 'x' })
  assert.throws(() => compareAssetTrees(dist, path.join(dist, '不存在')), /ENOENT/)
})

test('默认目录指向 sanye_client/dist-android 与包内 assets/public', () => {
  assert.match(defaultDirs.dist.replace(/\\/g, '/'), /sanye_client\/dist-android$/)
  assert.match(defaultDirs.packaged.replace(/\\/g, '/'), /android\/app\/src\/main\/assets\/public$/)
})

test(
  '真实仓库自检：当前包内资源与前端构建一致',
  { skip: !existsSync(defaultDirs.dist) || !existsSync(defaultDirs.packaged) ? '需要先跑 build:android 与 cap sync 才有两棵资源树' : false },
  () => {
    const result = compareAssetTrees(defaultDirs.dist, defaultDirs.packaged)
    assert.equal(
      assetsMatch(result),
      true,
      `包内资源与 sanye_client/dist-android 不一致：缺失 ${result.missingInPackaged.length} 个、多余 ${result.extraInPackaged.length} 个、内容不同 ${result.changed.length} 个（先跑 build:android 与 cap sync）`,
    )
  },
)
