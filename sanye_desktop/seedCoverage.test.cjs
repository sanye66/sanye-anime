const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, 'runtime')
const seedFile = path.join(root, 'seed.sql')
const manifestFile = path.join(root, 'seed-manifest.json')
const prepared = fs.existsSync(seedFile) && fs.existsSync(manifestFile)

/**
 * 固定种子引用的站内资源必须随包分发。
 *
 * 历史缺陷：`seed.sql` 引用了 5 张 `/admin-profile/...` 封面，包内只复制了 4 张，
 * 客户端请求缺失的那张得到 404 后只能回退占位图（《你的名字》封面就是这么丢的）。
 * 该门禁同时检查「引用的文件存在」和「manifest 已登记且摘要一致」两个方向。
 */
function referencedAssets() {
  const seed = fs.readFileSync(seedFile, 'utf8')
  return [...new Set([...seed.matchAll(/\/admin-profile\/[A-Za-z0-9_./-]+/g)].map(match => match[0]))]
}

test('seed references only bundled covers and the manifest matches the files on disk', { skip: !prepared }, () => {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  assert.equal(manifest.version, 1)
  const listed = new Set(manifest.files.map(entry => entry.path))

  const referenced = referencedAssets()
  assert.ok(referenced.length > 0, '固定种子必须引用随包封面')
  for (const asset of referenced) {
    const relative = `client/${asset.replace(/^\//, '')}`
    assert.ok(fs.existsSync(path.join(root, 'client', asset.replace(/^\//, ''))),
      `固定种子引用的封面没有随包分发：${asset}`)
    assert.ok(listed.has(relative), `固定种子引用的封面没有登记到 seed-manifest.json：${relative}`)
  }

  for (const entry of manifest.files) {
    const file = path.join(root, entry.path)
    assert.ok(fs.existsSync(file), `seed-manifest.json 登记的文件缺失：${entry.path}`)
    const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    assert.equal(digest, entry.sha256, `固定种子文件摘要不一致：${entry.path}`)
  }
})
