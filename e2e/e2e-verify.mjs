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
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

try {
  // 1. 首页加载真实后端数据
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('最近更新', { exact: false }).first().waitFor({ timeout: 10000 })
  const hasApiTitle = await page.getByText('你的名字', { exact: false }).count()
  const recentSectionCount = await page.locator('section.recent-section').count()
  const importedSectionCount = await page.locator('section.imported-section').count()
  const recentTitle = await page.locator('section.recent-section h2').textContent()
  ok('首页接口数据渲染', hasApiTitle > 0 && recentSectionCount === 1 && importedSectionCount === 0 && recentTitle?.trim() === '最近更新',
    `你的名字出现 ${hasApiTitle} 次，最近更新区块 ${recentSectionCount} 个，最近导入区块 ${importedSectionCount} 个`)
  const recommendedTitles = await page.locator('.hero-copy-slide h2').allTextContents()
  ok('首页精选推荐作品', recommendedTitles.some((title) => title.includes('你的名字')) && recommendedTitles.some((title) => title.includes('无职转生')) && recommendedTitles.length === 2,
    `精选作品：${recommendedTitles.map((title) => title.replace(/\s+/g, ' ').trim()).join('、')}`)

  // 2. 首页 → 作品详情（真实接口）
  await page.locator('a[href="/anime/127"]').first().click()
  await page.waitForURL('**/anime/127', { timeout: 10000 })
  await page.getByText('问 AI 关于这部作品').first().waitFor({ timeout: 10000 })
  const summaryVisible = await page.getByText(/在远离大都会/).count()
  ok('详情页真实接口', summaryVisible > 0, '你的名字简介来自后端')
  const importedTitleVisible = await page.getByText('你的名字', { exact: false }).count()
  const similarVisible = await page.getByText('相似作品', { exact: false }).count()
  const scheduleVisible = await page.getByText('排期', { exact: false }).count()
  ok('详情页作品/相似/排期', importedTitleVisible > 0 && similarVisible > 0 && scheduleVisible > 0, `作品${importedTitleVisible} 相似${similarVisible} 排期${scheduleVisible}`)
  const favBtn = page.getByRole('button', { name: /收藏作品|已收藏/ }).first()
  if ((await favBtn.count()) > 0) {
    const alreadyFavorite = await page.getByRole('button', { name: '已收藏' }).count()
    if (alreadyFavorite > 0) {
      ok('收藏作品（设备级）', true, '作品已处于已收藏状态，断言保持幂等')
    } else {
      await favBtn.click()
      await page.waitForTimeout(800)
      const favLabel = await page.getByRole('button', { name: '已收藏' }).count()
      ok('收藏作品（设备级）', favLabel > 0, '收藏按钮切换为已收藏')
    }
  } else {
    ok('收藏作品（设备级）', false, '未找到收藏按钮')
  }

  // 2b. 番剧仓库：真实接口分页与筛选
  // 仓库包含较大的独立封面，DOM 就绪后再等待作品标题，避免 networkidle 被图片和性能上报拖住。
  await page.goto(`${BASE}/anime-repository`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 })
  const repoCount = await page.locator('.repository-summary strong').textContent()
  await page.locator('.repository-select select').nth(0).selectOption('电视动画')
  await page.waitForTimeout(800)
  const filterActive = await page.getByText('筛选条件已生效', { exact: false }).count()
  ok('仓库接口分页与筛选', Number(repoCount) === 6 && filterActive > 0, `总数${repoCount} 筛选生效${filterActive}`)

  // 2c. 我的页面：收藏与历史真实数据
  await page.goto(`${BASE}/mine`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 })
  const mineText = await page.locator('.mine-library-grid').innerText()
  ok('我的页收藏与历史', mineText.includes('收藏') && mineText.includes('历史记录'), '收藏/历史面板含作品数据')

  // 2d. 搜索页：Elasticsearch 已就绪时展示真实命中结果，服务故障另由网络专项覆盖。
  await page.goto(`${BASE}/search?keyword=${encodeURIComponent('你的名字')}`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(1200)
  const searchText = await page.locator('.search-results').innerText()
  const hasResult = searchText.includes('你的名字')
  const searchFailed = searchText.includes('搜索服务暂不可用')
  ok('搜索页 Elasticsearch 命中', hasResult && !searchFailed, hasResult ? '显示真实命中结果' : '未找到你的名字')

  // 2e. 一周排期页：真实接口数据（T-D-05）
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByRole('tab', { name: /周四/ }).click()
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 })
  const scheduleText = await page.locator('.schedule-page').innerText()
  const scheduleTotal = await page.locator('.schedule-summary strong').textContent()
  const scheduleDegraded = scheduleText.includes('接口暂不可用')
  ok('一周排期真实接口', !scheduleDegraded && Number(scheduleTotal) >= 6 && scheduleText.includes('你的名字'), `总数${scheduleTotal} 降级${scheduleDegraded}`)

  // 2f. 模型配置页：真实模型状态 + 偏好保存/回读（T-D-05）
  await page.goto(`${BASE}/mine/model-config`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('模型服务', { exact: false }).first().waitFor({ timeout: 10000 })
  const modelStatusText = await page.locator('.settings-page').innerText()
  const modelStatusOk = modelStatusText.includes('已连接') && (modelStatusText.includes('本地模拟') || modelStatusText.includes('在线模型')) && modelStatusText.includes('PostgreSQL 持久化')
  const tempSlider = page.locator('.slider-field input[type="range"]')
  for (let i = 0; i < 4; i++) await tempSlider.press('ArrowLeft')
  await page.locator('.form-actions .primary-button').click()
  await page.getByText('回答偏好已保存', { exact: false }).waitFor({ timeout: 10000 })
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('模型服务', { exact: false }).first().waitFor({ timeout: 10000 })
  const tempAfterReload = await page.locator('.slider-field output').textContent()
  ok('模型配置页真实绑定', modelStatusOk && tempAfterReload.includes('0.3'), `状态${modelStatusOk} 温度${tempAfterReload}`)

  // 2g. 官网法律页：公开接口正文（T-D-07）
  await page.goto(`${BASE}/official/legal`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('隐私政策摘要', { exact: false }).first().waitFor({ timeout: 10000 })
  const legalText = await page.locator('.official-legal').innerText()
  const legalDegraded = legalText.includes('正文接口暂不可用')
  ok('官网法律页真实接口', !legalDegraded && legalText.includes('隐私政策摘要'), `降级${legalDegraded}`)

  // 3. 详情 → AI 工作区（携带作品上下文）
  await page.goto(`${BASE}/anime/127`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('问 AI 关于这部作品').first().click()
  await page.waitForURL('**/ai?animeId=*', { timeout: 10000 })
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 })
  ok('AI 上下文携带作品', true, page.url())

  // 4. AI SSE 流式回答 + 推荐卡片
  const input = page.locator('.chat-input input')
  await input.fill('帮我推荐两部类似你的名字的作品')
  await page.locator('.chat-input .send-button').click()
  const cardLocator = page.getByText('查看推荐作品').first()
  let cardSeen = true
  try {
    await cardLocator.waitFor({ timeout: 15000 })
  } catch {
    cardSeen = false
  }
  const answerText = await page.locator('.chat-messages').innerText()
  const assistantMessages = page.locator('.message-row.assistant .message-bubble p')
  const assistantText = await assistantMessages.allTextContents()
  const hasAssistantAnswer = assistantText.some((text) => text.trim().length > 0)
  ok('SSE 流式回答', hasAssistantAnswer, `助手消息${assistantText.length}条，正文${assistantText.join('').length}字`)
  ok('推荐卡片链路', cardSeen, cardSeen ? '推荐链接出现' : '未产出推荐卡片（外部阻塞或缺卡）')

  // 4b. SAFE 剧透防护：问结局不泄露
  await page.locator('.chat-input input').fill('你的名字的结局是什么')
  await page.locator('.chat-input .send-button').click()
  await page.waitForTimeout(4000)
  const messagesText = await page.locator('.chat-messages').innerText()
  const leaked = messagesText.includes('结局就是') || messagesText.includes('凶手是') || messagesText.includes('真相是')
  ok('SAFE 剧透防护', !leaked, leaked ? '检测到剧透泄露' : '回答未泄露结局')

  // 5. 推荐卡片 → 详情页闭环
  if (cardSeen) {
    await page.locator('.message-recommendation').first().click()
    await page.waitForURL('**/anime/*', { timeout: 10000 })
    ok('推荐卡片回详情', page.url().includes('/anime/'))
  } else {
    ok('推荐卡片回详情', false, '推荐卡片不存在，跳过点击避免放大为执行异常')
  }

  // 6. 官网公开页（经网关，picks 来自 /public/home）
  await page.goto(`${BASE}/official`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('公开精选', { exact: false }).first().waitFor({ timeout: 10000 })
  const officialPick = await page.getByText('你的名字', { exact: false }).count()
  ok('官网公开接口 picks', officialPick > 0, '公开精选含后端作品')

  // 7. 配额展示
  await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle', timeout: 20000 })
  const quotaNote = await page.locator('.quota-note').first().textContent()
  ok('配额展示', quotaNote.includes('匿名体验') || quotaNote.includes('已登录'), quotaNote ?? '')

  // 8. 管理端真实登录（RuoYi 经网关）
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').waitFor({ timeout: 10000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  const dashboardText = await page.locator('body').innerText()
  ok('管理端真实登录', dashboardText.includes('运营概览') || dashboardText.includes('仪表盘'), '登录后进入管理端首页')
  await page
    .waitForFunction(() => Number.parseInt(document.querySelector('.admin-metric strong')?.textContent ?? '', 10) >= 6, null, { timeout: 10000 })
    .catch(() => undefined)
  const metricValue = await page.locator('.admin-metric strong').first().innerText()
  // 当前正式片库固定为 6 条，E2E 临时草稿不计入正式内容基线。
  ok('管理端仪表盘真实统计', Number.parseInt(metricValue, 10) >= 6, metricValue)

  // 8b. 管理端内容管理：真实数据 + 状态流转（先复位再下架/恢复）
    await page.request.patch('http://localhost:8082/api/v1/manage/anime/127/status', {
    headers: { 'X-Caller-Name': 'sanye-admin-server', 'Content-Type': 'application/json' },
    data: { status: '已发布' },
  })
  await page.goto(`${ADMIN_BASE}/content`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 15000 })
  const downBtn = page.locator('.el-table__row').first().getByRole('button', { name: '下架' })
  if ((await downBtn.count()) > 0) {
    await downBtn.click()
    await page.waitForTimeout(1000)
  }
  const afterDown = await page.locator('.el-table__row').first().innerText()
  ok('管理端内容状态流转', afterDown.includes('已下架'), '下架操作生效')
  const repubBtn = page.locator('.el-table__row').first().getByRole('button', { name: '重新发布' })
  if ((await repubBtn.count()) > 0) {
    await repubBtn.click()
    await page.waitForTimeout(1000)
  }
  const afterRestore = await page.locator('.el-table__row').first().innerText()
  ok('管理端恢复发布', afterRestore.includes('已发布'), '重新发布生效')

  // 8b2. 内容管理：新建草稿 + 编辑（T-F-03 深化）
  const crudTitle = `E2E 新建测试番 ${Date.now()}`
  await page.getByRole('button', { name: /新建内容/ }).click()
  await page.locator('.anime-draft-form input[placeholder="作品标题"]').fill(crudTitle)
  await page.locator('.anime-draft-form input[placeholder="电视动画 / 剧场版 / 网络动画"]').fill('网络动画')
  await page.locator('.anime-draft-form textarea[placeholder="作品简介（可选）"]').fill('E2E 创建的作品简介。')
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByText(/已创建草稿/).waitFor({ timeout: 10000 })
  const newRow = page.locator('.el-table__row').filter({ hasText: crudTitle })
  await newRow.waitFor({ timeout: 10000 })
  const newRowText = await newRow.innerText()
  ok('管理端新建作品草稿', newRowText.includes('草稿'), '新作品以草稿进入列表')
  await newRow.getByRole('button', { name: '编辑' }).click()
  await page.locator('.anime-draft-form input[placeholder="例如：周三 22:00 更新 / 已完结"]').fill('周五 22:30 更新')
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByText(/作品已更新/).waitFor({ timeout: 10000 })
  const editedRow = page.locator('.el-table__row').filter({ hasText: crudTitle })
  ok('管理端编辑作品', (await editedRow.innerText()).includes('草稿'), '编辑后仍为草稿（不改变发布状态）')

  // 8c. 客户端反馈提交 + 管理端处理闭环
  await page.goto(`${BASE}/mine/feedback`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('textarea').fill('E2E 反馈：希望增加导出功能')
  await page.locator('.feedback-form-panel .primary-button').click()
  await page.getByText('你的回声已经被听见', { exact: false }).waitFor({ timeout: 10000 })
  ok('客户端反馈提交', true, '提交成功进入成功态')
  await page.goto(`${ADMIN_BASE}/feedback`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('E2E 反馈：希望增加导出功能', { exact: false }).first().waitFor({ timeout: 15000 })
  const processBtn = page.getByRole('button', { name: '开始处理' }).first()
  if ((await processBtn.count()) > 0) {
    await processBtn.click()
    await page.waitForTimeout(1000)
  }
  const fbRow = await page.locator('.el-table__row').first().innerText()
  ok('管理端反馈处理', fbRow.includes('处理中'), '反馈状态推进到处理中')

  // 8d. 部分授权用户：内容可访问、反馈被前端守卫拦截
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('ry')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.goto(`${ADMIN_BASE}/content`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1500)
  const contentAllowed = page.url().includes('/content')
  await page.goto(`${ADMIN_BASE}/feedback`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1500)
  const feedbackBlocked = page.url().includes('/dashboard')
  ok('部分授权用户守卫', contentAllowed && feedbackBlocked, `内容可访问=${contentAllowed} 反馈被拦截=${feedbackBlocked}`)

  // 8e. 任务管理页（Quartz 生命周期）
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.goto(`${ADMIN_BASE}/jobs`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('系统默认（无参）', { exact: false }).first().waitFor({ timeout: 15000 })
  const jobRow = page.locator('.el-table__row').first()
  if ((await jobRow.getByRole('button', { name: '恢复' }).count()) > 0) {
    await jobRow.getByRole('button', { name: '恢复' }).click()
    await page.waitForTimeout(800)
  }
  await jobRow.getByRole('button', { name: '暂停' }).click()
  await page.waitForTimeout(1000)
  const afterJobPause = await jobRow.innerText()
  ok('任务管理暂停', afterJobPause.includes('已暂停'), '暂停任务生效')
  await jobRow.getByRole('button', { name: '恢复' }).click()
  await page.waitForTimeout(1000)
  const afterJobResume = await jobRow.innerText()
  ok('任务管理恢复', afterJobResume.includes('运行中'), '恢复任务生效')

  // 8f. 官网正文编辑闭环（T-D-07）：管理端发布 → 官网可见
  await page.goto(`${ADMIN_BASE}/official-content`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('隐私政策', { exact: false }).first().waitFor({ timeout: 15000 })
  await page.getByText('隐私政策', { exact: false }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.legal-field textarea').fill('E2E 审查后的隐私政策正文。\n\n第二段补充说明。')
  await page.getByRole('button', { name: '保存并发布' }).click()
  await page.getByText('「隐私政策」已发布', { exact: false }).waitFor({ timeout: 10000 })
  await page.goto(`${BASE}/official/legal`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('E2E 审查后的隐私政策正文', { exact: false }).first().waitFor({ timeout: 10000 })
  ok('官网正文编辑闭环', true, '管理端保存并发布 → 官网公开接口可见')
} catch (err) {
  ok('执行异常', false, String(err))
}

const corsErrors = errors.filter((e) => e.toLowerCase().includes('cors') || e.toLowerCase().includes('blocked'))
ok('无 CORS/跨域错误', corsErrors.length === 0, corsErrors.join(' | '))
const realErrors = errors.filter(
  (e) => !e.toLowerCase().includes('favicon') && !e.toLowerCase().includes('401'),
)
ok('无资源/JS 错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n共 ${results.length} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

