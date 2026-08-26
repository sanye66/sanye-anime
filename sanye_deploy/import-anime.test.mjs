import test from 'node:test'
import assert from 'node:assert/strict'
import { extractDetailUrls, parseAnimePage, validateSourceUrl } from './anime-importer.mjs'

test('解析 Open Graph、JSON-LD 和关键词为作品元数据', () => {
  const html = `<html><head>
    <title>无职转生 - 作品详情</title>
    <meta property="og:title" content="无职转生：到了异世界就拿出真本事">
    <meta name="description" content="这是作品简介。">
    <meta property="og:image" content="/covers/mushoku.jpg">
    <meta name="keywords" content="异世界,冒险,成长">
    <script type="application/ld+json">{"@type":"TVSeries","datePublished":"2021-01-01"}</script>
  </head></html>`
  const result = parseAnimePage(html, 'https://example.com/anime/1', {})
  assert.equal(result.title, '无职转生：到了异世界就拿出真本事')
  assert.equal(result.year, 2021)
  assert.deepEqual(result.tags, ['异世界', '冒险', '成长'])
  assert.equal(result.coverUrl, 'https://example.com/covers/mushoku.jpg')
  assert.equal(result.type, '电视动画')
})

test('自动把你的名字判定为剧场版并支持标题覆盖', () => {
  const result = parseAnimePage('<title>樱花动漫</title>', 'https://example.com/movie/1', { title: '你的名字' })
  assert.equal(result.title, '你的名字')
  assert.equal(result.type, '剧场版')
  assert.equal(result.useful, true)
})

test('解析旧式详情页的标题、简介、首播年份和封面', () => {
  const html = `<title>无职转生 | 日本动漫大全 - 樱花动漫</title>
    <h1 class="article-title"><a>无职转生：到了异世界就拿出真本事在线观看</a></h1>
    <div class="video_img"><img src="https://www.mdzywtupian.com/upload/cover.jpg"></div>
    <div class="video_info"><strong>类型:</strong>日韩动漫<br><strong>首播:</strong>2021-01-01</div>
    <p class="jianjie"><span><p>剧情：这是完整简介。</p></span></p>`
  const result = parseAnimePage(html, 'https://yinghuadongman.org.cn/p/1/', {})
  assert.equal(result.title, '无职转生：到了异世界就拿出真本事')
  assert.equal(result.year, 2021)
  assert.equal(result.summary, '这是完整简介。')
  assert.equal(result.coverUrl, 'https://www.mdzywtupian.com/upload/cover.jpg')
  assert.equal(result.type, '电视动画')
})

test('从公开搜索页提取去重后的作品详情链接，不提取播放器链接', () => {
  const html = `<a href="/p/1/">作品一</a><a href="/p/1/">重复</a><a href="/v/1-1-1/">播放器</a><a href="/p/2/">作品二</a>`
  assert.deepEqual(extractDetailUrls(html, 'https://yinghuadongman.org.cn/u/?wd=测试'), [
    'https://yinghuadongman.org.cn/p/1/',
    'https://yinghuadongman.org.cn/p/2/',
  ])
})

test('来源地址只允许白名单 HTTPS 域名', () => {
  assert.equal(validateSourceUrl('https://www.yinghco.com.cn/zh-cn/app.html').hostname, 'www.yinghco.com.cn')
  assert.throws(() => validateSourceUrl('http://www.yinghco.com.cn/zh-cn/app.html'))
  assert.throws(() => validateSourceUrl('https://localhost:8089/login'))
})
