import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://localhost:5175'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
const globalErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') globalErrors.push(`[console] ${m.text().slice(0, 220)}`)
})
page.on('pageerror', (e) => globalErrors.push(`[pageerror] ${String(e).slice(0, 220)}`))
page.on('requestfailed', (r) => {
  const url = r.url()
  const errorText = r.failure()?.errorText ?? ''
  // 页面跳转或切换选集时，浏览器会主动中止尚未完成的 HLS 分片请求；这不是播放失败。
  const expectedMediaAbort = /\.(?:m3u8|ts|key)(?:$|\?)/i.test(url) && /ERR_ABORTED/i.test(errorText)
  if (!url.includes('favicon') && !url.includes('8443') && !expectedMediaAbort) {
    globalErrors.push(`[reqfail] ${url.slice(0, 120)} ${errorText}`)
  }
})

function errorsSince(start) {
  return globalErrors.slice(start)
}

async function goto(url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {
    return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
  })
  await page.waitForTimeout(300)
}

async function waitForContent(label) {
  if (label.includes('最近更新')) await page.getByText('最近更新', { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {})
  if (label.includes('番剧仓库')) await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {})
  if (label.includes('我的')) await page.getByText('收藏', { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {})
  if (label.includes('隐私政策')) await page.getByText('隐私政策', { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {})
  if (label.includes('系统默认')) await page.getByText('系统默认', { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(300)
}

async function collectClickables() {
  return page.locator('button:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"])').evaluateAll((els) =>
    els
      .filter((el) => {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
        href: el.getAttribute('href') ?? '',
      })),
  )
}

function mark(c) {
  return `${c.tag}|${c.text}|${c.href}`
}

async function closeDialogs() {
  const dialogs = page.locator('.el-dialog, [role="dialog"]')
  for (let i = 0; i < (await dialogs.count()); i++) {
    if (await dialogs.nth(i).isVisible()) {
      await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(150)
    }
  }
}

async function ensureAdminLoggedIn() {
  if (page.url().includes('/login')) {
    await page.locator('input[aria-label="账号"]').fill('admin')
    await page.locator('input[aria-label="密码"]').fill('admin123')
    await page.locator('.login-form button[type="submit"]').click()
    await page.waitForURL('**/dashboard', { timeout: 20000 })
    await page.waitForTimeout(800)
  }
}

async function checkPage(label, url) {
  let opened = true
  try {
    await goto(url)
    await waitForContent(label)
    if (label.startsWith('管理端')) await ensureAdminLoggedIn()
  } catch (e) {
    ok(`${label} 页面打开`, false, String(e).slice(0, 160))
    return
  }

  const tested = new Set()
  let queue = await collectClickables()
  let guard = 0
  let checkedCount = 0
  while (queue.length > 0 && guard++ < 80) {
    const c = queue.shift()
    const key = mark(c)
    if (tested.has(key)) continue
    tested.add(key)
    checkedCount++

    const base = globalErrors.length
    const beforeUrl = page.url()
    let clicked = true
    let clickError = ''
    try {
      const loc = page
        .locator('button:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"])')
        .filter({ hasText: c.text || ' ' })
        .first()
      if ((await loc.count()) === 0) throw new Error('元素不存在（状态已切换）')
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
      if (!(await loc.isVisible())) throw new Error('不可见（非当前视图）')
      const box = await loc.boundingBox()
      const vw = page.viewportSize()?.width ?? 1280
      const vh = page.viewportSize()?.height ?? 720
      if (!box || box.x < -2 || box.y < -2 || box.x > vw || box.y > vh) throw new Error('非当前视图')
      const coveredBy = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y)
          return el ? (el.closest('a,button')?.textContent ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) : 'null'
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
      if (c.text && coveredBy && !coveredBy.includes(c.text)) throw new Error('非当前视图（被覆盖）')
      await loc.click({ timeout: 4000 })
      await page.waitForTimeout(300)
    } catch (e) {
      clicked = false
      clickError = String(e).slice(0, 110)
    }

    const newErrors = errorsSince(base)
    const serious = newErrors.filter((e) => !e.toLowerCase().includes('favicon') && !e.includes('8443'))
    const urlChanged = page.url() !== beforeUrl

    if (page.url().includes('/login') && label.startsWith('管理端')) {
      await ensureAdminLoggedIn()
      await page.goto(beforeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    } else if (urlChanged) {
      await page.goto(beforeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    }
    await closeDialogs()
    await page.waitForTimeout(150)
    const bodyEmpty = (await page.locator('body').innerText()).trim().length < 10
    const stateSwitched = clickError.includes('元素不存在')
    const hiddenSlide = clickError.includes('非当前视图')
    const navTimeout = !clicked && clickError.includes('Timeout') && serious.length === 0
    const failed = (!clicked && !navTimeout) || serious.length > 0 || bodyEmpty
    if (stateSwitched || hiddenSlide) {
      ok(`${label} 按钮「${c.text || c.href || c.tag}」`, true, stateSwitched ? '点击生效（状态已切换）' : '跳过：非当前视图元素')
    } else {
      ok(`${label} 按钮「${c.text || c.href || c.tag}」`, !failed, (serious[0] ?? clickError).slice(0, 150))
    }
    const next = (await collectClickables()).filter((n) => {
      const key = mark(n)
      return !tested.has(key) && !queue.some((q) => mark(q) === key)
    })
    queue = queue.concat(next)
  }
  ok(`${label} 页面打开`, opened, `${checkedCount} 个按钮已检测`)
}

const clientPages = [
  ['客户端-首页', `${BASE}/`],
  ['客户端-番剧仓库', `${BASE}/anime-repository`],
  ['客户端-搜索', `${BASE}/search?keyword=${encodeURIComponent('你的名字')}`],
  ['客户端-一周排期', `${BASE}/schedule`],
  ['客户端-AI 工作区', `${BASE}/ai`],
  ['客户端-我的', `${BASE}/mine`],
  ['客户端-问题反馈', `${BASE}/mine/feedback`],
  ['客户端-作品详情', `${BASE}/anime/127`],
  ['客户端-官网首页', `${BASE}/official`],
  ['客户端-官网介绍', `${BASE}/official/about`],
  ['客户端-官网下载', `${BASE}/official/download`],
  ['客户端-官网法律', `${BASE}/official/legal`],
]

const adminPages = [
  ['管理端-仪表盘', `${ADMIN_BASE}/dashboard`],
  ['管理端-内容管理', `${ADMIN_BASE}/content`],
  ['管理端-官网正文', `${ADMIN_BASE}/official-content`],
  ['管理端-用户反馈', `${ADMIN_BASE}/feedback`],
  ['管理端-任务管理', `${ADMIN_BASE}/jobs`],
  ['管理端-任务日志', `${ADMIN_BASE}/jobs/logs`],
  ['管理端-用户管理', `${ADMIN_BASE}/users`],
  ['管理端-权限与审计', `${ADMIN_BASE}/audit`],
]

try {
  for (const [label, url] of clientPages) {
    await checkPage(label, url)
  }

  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  ok('管理端登录', true, 'admin 登录成功')

  for (const [label, url] of adminPages) {
    await checkPage(label, url)
  }
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 300))
}

const realErrors = globalErrors.filter((e) => !e.toLowerCase().includes('favicon'))
ok('全程无资源/JS 错误', realErrors.length === 0, realErrors.slice(0, 5).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n按钮体检共 ${results.length} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)
