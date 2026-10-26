const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { chromium } = require('playwright')

const sourceRoot = path.resolve(__dirname, '../sanye_client/src/platform/android')
const css = readFileSync(path.join(sourceRoot, 'android.css'), 'utf8')
const component = readFileSync(path.join(sourceRoot, 'androidApp.vue'), 'utf8')
const track = component.match(/<span class="android-player-seek-track"[\s\S]*?<\/span>\s*<\/span>/)?.[0]
assert.ok(track, '必须使用实际播放器的轨道与圆点嵌套结构')
const markup = track.replace(/:style="[^"]*"/g, '')

async function measure(page, percent, state) {
  return page.evaluate(({ percent, state }) => {
    const seek = document.querySelector('.android-player-seek')
    const fill = seek.querySelector('.android-player-seek-fill')
    const thumb = seek.querySelector('.android-player-seek-thumb')
    seek.classList.toggle('is-dragging', state === 'dragging')
    if (state === 'focused') seek.focus()
    else seek.blur()
    fill.style.width = percent + '%'
    thumb.style.left = percent + '%'
    const rect = element => {
      const value = element.getBoundingClientRect()
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, centerX: value.left + value.width / 2, centerY: value.top + value.height / 2 }
    }
    return { track: rect(seek.querySelector('.android-player-seek-track')), fill: rect(fill), thumb: rect(thumb), stage: rect(document.querySelector('.android-player-stage')) }
  }, { percent, state })
}

test('安卓进度圆点在竖屏、展开与浏览器全屏中始终对齐轨道且端点完整可见', async context => {
  const browser = await chromium.launch({ headless: true })
  let samples = 0
  let maxOffset = 0
  try {
    for (const viewport of [{ width: 320, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const page = await browser.newPage({ viewport })
      await page.setContent('<!doctype html><div class="android-app"><div class="android-player android-player--inline"><div class="android-player-stage android-player-stage--compact"><div class="android-player-viewport"><video></video></div><div class="android-player-controls"><div class="android-player-seek" role="slider" tabindex="0">' + markup + '</div><div class="android-player-controls-row"><button class="android-player-play">播放</button><span class="android-player-time">00:00 / 01:00</span><button class="android-player-tool android-player-icon">放大</button></div></div></div></div></div>')
      await page.addStyleTag({ content: css })
      for (const mode of ['compact', 'expanded', 'fullscreen']) {
        await page.evaluate(mode => {
          const stage = document.querySelector('.android-player-stage')
          stage.classList.toggle('android-player-stage--compact', mode === 'compact')
          stage.classList.toggle('android-player-stage--expanded', mode === 'expanded')
        }, mode)
        if (mode === 'fullscreen') {
          await page.locator('.android-player-play').evaluate(button => button.addEventListener('click', () => document.querySelector('.android-player-stage').requestFullscreen(), { once: true }))
          await page.locator('.android-player-play').click()
          await page.waitForFunction(() => !!document.fullscreenElement)
        }
        for (const state of ['idle', 'dragging', 'focused']) {
          for (const percent of [0, 50, 100]) {
            const result = await measure(page, percent, state)
            const scene = viewport.width + 'px/' + mode + '/' + state + '/' + percent + '%'
            const horizontalOffset = Math.abs(result.thumb.centerX - result.fill.right)
            const verticalOffset = Math.abs(result.thumb.centerY - result.track.centerY)
            maxOffset = Math.max(maxOffset, horizontalOffset, verticalOffset)
            assert.ok(horizontalOffset <= 0.1, scene + ' 圆点中心没有对齐进度末端: ' + JSON.stringify(result))
            assert.ok(verticalOffset <= 0.1, scene + ' 圆点中心没有对齐轨道中心: ' + JSON.stringify(result))
            assert.ok(result.thumb.left >= result.stage.left && result.thumb.right <= result.stage.right && result.thumb.top >= result.stage.top && result.thumb.bottom <= result.stage.bottom, scene + ' 圆点被舞台边界裁切: ' + JSON.stringify(result))
            samples++
          }
        }
        if (process.env.ANDROID_SEEK_SCREENSHOTS === '1') {
          await measure(page, 50, 'dragging')
          const screenshot = path.join(os.tmpdir(), 'sanye-seek-' + viewport.width + '-' + mode + '.png')
          await page.locator('.android-player-stage').screenshot({ path: screenshot })
          context.diagnostic('截图: ' + screenshot)
        }
        if (mode === 'fullscreen') await page.evaluate(() => document.exitFullscreen())
      }
      await page.close()
    }
    context.diagnostic('已检查 ' + samples + ' 个几何状态，最大中心偏差 ' + maxOffset.toFixed(4) + 'px')
  } finally {
    await browser.close()
  }
})

test('竖屏暂停图标与时间同一水平线，触控区域不遮挡进度条', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.setContent('<div class="android-app"><div class="android-player"><div class="android-player-stage android-player-stage--compact"><div class="android-player-viewport"><video></video></div><div class="android-player-controls"><div class="android-player-seek"><span class="android-player-seek-track"></span></div><div class="android-player-controls-row"><button class="android-player-play" aria-label="暂停播放"><svg class="android-icon" viewBox="0 0 24 24"><path d="M9.5 5.5v13 M14.5 5.5v13" /></svg></button><span class="android-player-time">00:12 / 22:10</span><button class="android-player-tool android-player-icon">放大</button></div></div></div></div></div>')
    await page.addStyleTag({ content: css })
    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect()
      const icon = rect('.android-player-play .android-icon'), time = rect('.android-player-time')
      const button = rect('.android-player-play'), seek = rect('.android-player-seek')
      return { distance: Math.abs(icon.top + icon.height / 2 - time.top - time.height / 2), buttonHeight: button.height, gap: seek.top - button.bottom }
    })
    assert.ok(geometry.distance <= 4, `暂停图标与时间应对齐：${JSON.stringify(geometry)}`)
    assert.ok(geometry.buttonHeight >= 44 && geometry.gap >= 0, `按钮命中区不应覆盖进度条：${JSON.stringify(geometry)}`)
  } finally { await browser.close() }
})
