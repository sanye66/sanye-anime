#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ALLOWED_HOSTS, extractDetailUrls, fetchHtml, loginAdmin, parseAnimePage, uploadCover, upsertAnime, validateSourceUrl } from './anime-importer.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

/** 读取脚本旁边的本地配置文件，便于把脚本和模板一起发给别人使用。 */
function loadLocalEnv() {
  for (const fileName of ['import-anime.env', '.import-anime.env']) {
    const filePath = path.join(scriptDir, fileName)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [rawKey, ...rawValue] = trimmed.split('=')
      const key = rawKey.trim()
      const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '')
      if (key && process.env[key] == null) process.env[key] = value
    }
    return filePath
  }
  return ''
}

function parseBoolean(value) {
  return /^(1|true|yes|y|on)$/i.test(String(value ?? '').trim())
}

function splitEnvList(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

/** 解析重复参数，支持一次导入多个作品详情页。 */
function parseArgs(argv) {
  const options = {
    urls: splitEnvList(process.env.SANYE_IMPORT_URLS),
    allowedHosts: new Set([...DEFAULT_ALLOWED_HOSTS, ...splitEnvList(process.env.SANYE_IMPORT_ALLOW_HOSTS).map(item => item.toLowerCase())]),
    publish: parseBoolean(process.env.SANYE_IMPORT_PUBLISH),
    continueOnError: parseBoolean(process.env.SANYE_IMPORT_CONTINUE_ON_ERROR),
    adminUrl: process.env.SANYE_ADMIN_URL,
    username: process.env.SANYE_ADMIN_USERNAME,
    password: process.env.SANYE_ADMIN_PASSWORD,
    skipCover: parseBoolean(process.env.SANYE_IMPORT_SKIP_COVER),
    dryRun: parseBoolean(process.env.SANYE_IMPORT_DRY_RUN),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--url') options.urls.push(argv[++index])
    else if (value === '--admin-url') options.adminUrl = argv[++index]
    else if (value === '--username') options.username = argv[++index]
    else if (value === '--password') options.password = argv[++index]
    else if (value === '--title') options.title = argv[++index]
    else if (value === '--type') options.type = argv[++index]
    else if (value === '--year') options.year = argv[++index]
    else if (value === '--publish') options.publish = true
    else if (value === '--skip-cover') options.skipCover = true
    else if (value === '--continue-on-error') options.continueOnError = true
    else if (value === '--dry-run') options.dryRun = true
    else if (value === '--allow-host') options.allowedHosts.add(argv[++index].toLowerCase())
    else if (value === '--max-results') options.maxResults = Number(argv[++index])
    else if (value === '--help' || value === '-h') options.help = true
    else if (value.startsWith('-')) throw new Error(`未知参数：${value}`)
    else options.urls.push(value)
  }
  return options
}

/** 输出中文使用说明，明确脚本只导入元数据和封面。 */
function printHelp() {
  console.log(`用法：
  node sanye_deploy/import-anime.mjs https://example.com/anime/xxx
  $env:SANYE_ADMIN_PASSWORD='admin123'
  node sanye_deploy/import-anime.mjs --url https://example.com/anime/xxx --publish

参数：
  <地址>                作品详情页、搜索页或分类页，支持直接放在命令末尾
  --url <地址>          作品详情页、搜索页或分类页，可重复传入
  --admin-url <地址>    管理 API 根地址，默认 http://localhost:8091/api/v1/admin
  --username <账号>     默认 admin
  --password <密码>     或使用 SANYE_ADMIN_PASSWORD 环境变量
  --title <标题>        页面是列表页时手工指定标题
  --type <类型>         覆盖自动判断的电视动画/剧场版
  --year <年份>         覆盖页面年份
  --publish             导入后流转为已发布，默认只创建草稿
  --skip-cover          不下载和上传封面
  --dry-run             只解析并输出元数据，不登录管理端、不上传封面、不写库
  --continue-on-error   单条详情页失败时记录并继续处理后续条目
  --allow-host <域名>   追加来源或封面域名白名单
  --max-results <数量>  列表页最多发现的详情页数量，默认 100

本地配置：
  可把 sanye_deploy/import-anime.env.example 复制为 sanye_deploy/import-anime.env。
  支持 SANYE_ADMIN_URL、SANYE_ADMIN_USERNAME、SANYE_ADMIN_PASSWORD、
  SANYE_IMPORT_URLS、SANYE_IMPORT_PUBLISH、SANYE_IMPORT_DRY_RUN、
  SANYE_IMPORT_SKIP_COVER、SANYE_IMPORT_CONTINUE_ON_ERROR、SANYE_IMPORT_ALLOW_HOSTS。

脚本只读取公开 HTML 元数据并上传封面，不下载、转码、缓存或代理视频。`)
}

/** 导入一条详情页；封面失败时保留元数据，避免单个 CDN 阻断整批任务。 */
async function importDetail({ detailUrl, sourceUrl, sourceHtml, options, adminBase, token, deviceId }) {
  const detail = validateSourceUrl(detailUrl, options.allowedHosts)
  // 列表页需要重新读取详情页，详情页本身则复用已取得的 HTML，减少一次网络请求。
  const detailHtml = detail.toString() === sourceUrl ? sourceHtml : await fetchHtml(detail.toString())
  const metadata = parseAnimePage(detailHtml, detail.toString(), {
    title: options.title,
    type: options.type,
    year: options.year,
  })
  if (!metadata.useful) throw new Error(`页面未解析出明确作品标题：${detailUrl}；请使用 --title 指定`)

  if (options.dryRun) {
    console.log(JSON.stringify({
      action: 'preview',
      title: metadata.title,
      type: metadata.type,
      year: metadata.year || '',
      tags: metadata.tags,
      sourceUrl: metadata.sourceUrl,
      coverUrl: metadata.coverUrl || '',
      summary: metadata.summary,
    }))
    return
  }

  let coverWarning = ''
  if (!options.skipCover && metadata.coverUrl) {
    try {
      metadata.coverUrl = await uploadCover(adminBase, token, deviceId, metadata.coverUrl, options.allowedHosts)
    } catch (error) {
      // 封面属于增强信息；来源 CDN 失效时仍登记可用的标题、简介和来源地址。
      coverWarning = error.message
      // 使用 undefined 让 upsertAnime 省略字段，更新已有作品时不会误清空旧封面。
      metadata.coverUrl = undefined
      console.error(`[封面跳过] ${metadata.title}：${coverWarning}`)
    }
  } else {
    // --skip-cover 只跳过本次封面处理，不覆盖已有作品的站内封面。
    metadata.coverUrl = undefined
  }

  const result = await upsertAnime(adminBase, token, deviceId, metadata, options.publish)
  console.log(JSON.stringify({
    ...result,
    title: metadata.title,
    sourceUrl: metadata.sourceUrl,
    coverUrl: metadata.coverUrl || '',
    ...(coverWarning ? { coverWarning } : {}),
  }))
}

/** 规范化管理 API 根路径，避免用户误传到具体接口。 */
function normalizeAdminUrl(value) {
  return (value || 'http://localhost:8091/api/v1/admin').replace(/\/$/, '')
}

async function readInteractiveOptions(options) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    if (!options.urls.length) {
      const answer = await rl.question('请粘贴作品详情页、搜索页或分类页 URL：')
      if (answer.trim()) options.urls.push(answer.trim())
    }
    if (!options.dryRun && !options.password) {
      const answer = await rl.question('请输入管理端密码（输入不会隐藏，请注意周围环境）：')
      options.password = answer.trim()
    }
  } finally {
    rl.close()
  }
}

/** 执行批量元数据导入并逐条输出结果。 */
async function main() {
  const envFile = loadLocalEnv()
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return printHelp()
  await readInteractiveOptions(options)
  if (!options.urls.length) throw new Error('至少需要一个 URL；请传入作品详情页或公开搜索页')
  const password = options.password || process.env.SANYE_ADMIN_PASSWORD
  if (!options.dryRun && !password) throw new Error('请通过 --password、SANYE_ADMIN_PASSWORD 或 import-anime.env 提供管理端密码')
  const adminBase = normalizeAdminUrl(options.adminUrl)
  const deviceId = `anime-import-${process.pid}`
  const token = options.dryRun ? '' : await loginAdmin(adminBase, options.username || 'admin', password, deviceId)
  if (envFile) console.error(`[配置读取] ${envFile}`)
  const failures = []
  for (const sourceUrl of options.urls) {
    const source = validateSourceUrl(sourceUrl, options.allowedHosts)
    const html = await fetchHtml(source.toString())
    // 详情页只处理自身，搜索页/分类页才展开 /p/ 详情链接，避免误把相关推荐当成作品。
    const detailUrls = /^\/p\/[^/]+\/?$/i.test(source.pathname)
      ? [source.toString()]
      : extractDetailUrls(html, source.toString(), options.maxResults || 100)
    if (!detailUrls.length) throw new Error(`页面未发现作品详情链接：${sourceUrl}；请传入 /p/ 详情页或公开搜索页`)
    for (const detailUrl of detailUrls) {
      try {
        await importDetail({ detailUrl, sourceUrl: source.toString(), sourceHtml: html, options, adminBase, token, deviceId })
      } catch (error) {
        if (!options.continueOnError) throw error
        failures.push({ detailUrl, message: error.message })
        // 列表中的单条异常只影响当前作品，继续处理剩余详情页并在结束时返回失败码。
        console.error(`[单条跳过] ${detailUrl}：${error.message}`)
      }
    }
  }
  if (failures.length) throw new Error(`有 ${failures.length} 条详情页导入失败，请根据日志重试`)
}

main().catch(error => {
  console.error(`[导入失败] ${error.message}`)
  process.exitCode = 1
})
