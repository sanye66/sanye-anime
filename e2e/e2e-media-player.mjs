import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  // 用公开接口响应桩验证播放器状态，不向第三方来源发起真实播放请求。
  await page.route('**/api/v1/anime/127/episodes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          { id: 101, episodeNo: 1, title: '第 1 集', sourcePageUrl: 'https://example.com/p/1', playbackUrl: 'https://player.example/one', mimeType: 'text/html', sourceLabel: '测试来源' },
          { id: 102, episodeNo: 2, title: '第 2 集', sourcePageUrl: 'https://example.com/p/2', playbackUrl: 'https://player.example/two', mimeType: 'text/html', sourceLabel: '测试来源' },
        ],
        requestId: 'e2e-media',
      }),
    })
  })
  await page.route('https://player.example/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>测试播放器</title>' })
  })

  await page.goto(`${BASE}/anime/127`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.locator('.anime-player-section').waitFor({ timeout: 10000 })
  const iframe = page.locator('.anime-player-frame iframe')
  const firstSrc = await iframe.getAttribute('src')
  const sandbox = await iframe.getAttribute('sandbox')
  const referrerPolicy = await iframe.getAttribute('referrerpolicy')
  ok('播放器播放区加载', (await iframe.count()) === 1 && firstSrc === 'https://player.example/one', firstSrc ?? '')
  ok('外部播放器安全属性', sandbox?.includes('allow-scripts') && referrerPolicy === 'no-referrer', `${sandbox} / ${referrerPolicy}`)

  const episodeButtons = page.locator('.episode-button')
  await episodeButtons.nth(1).click()
  await page.waitForTimeout(100)
  const secondSrc = await iframe.getAttribute('src')
  ok('播放器选集切换', secondSrc === 'https://player.example/two', secondSrc ?? '')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  ok('移动端播放器无横向溢出', !overflow, `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`)
} catch (error) {
  ok('媒体播放器执行异常', false, String(error))
}

await browser.close()
const failed = results.filter((item) => !item.pass).length
console.log(`\n媒体播放器 E2E：通过 ${results.length - failed}/${results.length}`)
process.exit(failed > 0 ? 1 : 0)
