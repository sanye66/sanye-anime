package com.sanye.sanye_anime;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import java.net.URI;
import java.util.List;

public class SanyeSourcePluginTest {
    @Test
    public void searchUsesPcDetailRulesAndDeduplicates() throws Exception {
        String html = "<div class='item'><a href='/p/123/153/0' title='天气之子'><img src='/cover.jpg'></a>" +
            "<div class='module-card-item-title'>天气之子</div></div>" +
            "<a href='https://private.example/p/999' title='天气之子'>越界</a>" +
            "<a href='/p/123/153/0' title='天气之子'>重复</a>";
        List<SanyeSourcePlugin.SearchHit> hits = SanyeSourcePlugin.parseSearch(html, "https://www.yhdmtv.cc/search/index.html?keyword=x", "天气之子");
        assertEquals(1, hits.size());
        assertEquals("天气之子", hits.get(0).title());
        assertEquals("https://www.yhdmtv.cc/p/123/153/0", hits.get(0).sourceUrl());
        assertEquals("https://www.yhdmtv.cc/cover.jpg", hits.get(0).coverUrl());
    }

    @Test
    public void decodesSourcePagesByTheirDeclaredCharset() throws Exception {
        // 来源站返回 GBK/GB2312 时，固定按 UTF-8 解码会把中文标题解成乱码，
        // 解析出来的命中又会因为 normalize 对不上而全部落空（VQ-62）。
        String html = "<html><head><meta charset='gbk'></head><body><h1>天气之子</h1></body></html>";
        byte[] gbk = html.getBytes("GBK");
        // ① HTTP 头声明的字符集优先。
        assertTrue(SanyeSourcePlugin.decodeHtml(gbk, "text/html; charset=GBK").contains("天气之子"));
        assertTrue(SanyeSourcePlugin.decodeHtml(gbk, "text/html;charset=\"gb2312\"").contains("天气之子"));
        // ② 头部没写 charset 时回落到页面自己的 meta 声明。
        assertTrue(SanyeSourcePlugin.decodeHtml(gbk, "text/html").contains("天气之子"));
        // ③ 两处都没有时保持原来的 UTF-8 行为。
        assertTrue(SanyeSourcePlugin.decodeHtml("标题".getBytes("UTF-8"), "text/html").contains("标题"));
        // ④ 认不出的字符集名不能让整次抓取抛异常，仍按 UTF-8 解码。
        assertTrue(SanyeSourcePlugin.decodeHtml("标题".getBytes("UTF-8"), "text/html; charset=x-unknown-9").contains("标题"));
    }

    @Test
    public void pcSearchPrefersDetailOverPlaybackForSameTitle() {
        String html = "<div class='module-card-item'><h3>你的名字</h3>" +
            "<a href='/p/844920/364/0'>播放</a><a href='/v/844920/364'>详情</a></div>";
        var hits = SanyeSourcePlugin.parseSearch(html,
            "https://www.yhdmtv.cc/public/auto/search1.html?keyword=你的名字", "你的名字");
        assertEquals(1, hits.size());
        assertEquals("https://www.yhdmtv.cc/v/844920/364", hits.get(0).sourceUrl());
        assertTrue(SanyeSourcePlugin.allowedDetail(URI.create(hits.get(0).sourceUrl())));
        var preview = SanyeSourcePlugin.parsePreview("<h1>你的名字</h1><a href='/p/844920/364/0'>第1集</a>", hits.get(0).sourceUrl());
        assertEquals("https://www.yhdmtv.cc/p/844920/364/0", preview.episodes().get(0).sourceUrl());
    }

    @Test
    public void previewReadsPublicPlayerConfigWithoutExecutingScripts() throws Exception {
        String html = "<h1>天气之子</h1><meta name='description' content='雨中的故事'>" +
            "<div class='module-item-cover'><img data-original='/weather.jpg'></div>" +
            "<script>var player_aaaa={url:'https:\\/\\/media.example.org\\/episode.m3u8'};</script>";
        SanyeSourcePlugin.SourcePreview preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/p/123/153/0");
        assertEquals("天气之子", preview.title());
        assertEquals("https://www.yhdmtv.cc/weather.jpg", preview.coverUrl());
        assertEquals("雨中的故事", preview.summary());
        assertEquals("", SanyeSourcePlugin.parsePreview("<h1>作品</h1><div class='module-item-cover'><img src='https://external.example/track.jpg'></div>",
            "https://www.yhdmtv.cc/p/123/153/0").coverUrl());
        assertEquals("https://media.example.org/episode.m3u8", preview.episodes().get(0).playbackUrl());
        assertEquals(0, SanyeSourcePlugin.parsePreview("<h1>作品</h1><iframe src='https://elsewhere.example'></iframe>",
            "https://www.yhdmtv.cc/p/123/153/0").episodes().size());
    }

    @Test
    public void rejectsUnknownHostsAndNonHttpsRedirects() {
        assertTrue(SanyeSourcePlugin.allowedDetail(URI.create("https://www.yhdmtv.cc/p/123/153/0")));
        assertTrue(SanyeSourcePlugin.allowedDetail(URI.create("https://yinghuadongman.org.cn/v/54503-2-1/")));
        assertFalse(SanyeSourcePlugin.allowedDetail(URI.create("http://www.yhdmtv.cc/p/123")));
        assertFalse(SanyeSourcePlugin.allowedDetail(URI.create("https://private.example/p/123")));
        assertFalse(SanyeSourcePlugin.allowedDetail(URI.create("https://www.yhdmtv.cc/p/123?token=secret")));
        assertTrue(SanyeSourcePlugin.allowedCover(URI.create("https://img.picbf.com/upload/cover.jpg")));
        assertTrue(SanyeSourcePlugin.allowedCover(URI.create("https://www.mdzywtupian.com/upload/vod/cover.jpg")));
        assertFalse(SanyeSourcePlugin.allowedCover(URI.create("https://www.mdzywtupian.com.evil.example/cover.jpg")));
        assertFalse(SanyeSourcePlugin.allowedCover(URI.create("http://img.picbf.com/cover.jpg")));
        assertFalse(SanyeSourcePlugin.allowedHost(URI.create("https://img.picbf.com/upload/cover.jpg")));
        assertFalse(SanyeSourcePlugin.allowedCover(URI.create("https://img.picbf.com.evil.example/cover.jpg")));
    }

    @Test
    public void previewKeepsSameWorkPlaylistAndRejectsOtherWork() {
        String html = "<h1>作品</h1><div class='module-play-list'>" +
            "<a href='/v/903-1-1/'>第1集</a><a href='/v/903-1-2/'>第2集</a>" +
            "<a href='/v/999-1-1/'>其他作品</a><a href='https://elsewhere.example/v/903-1-3/'>越界</a></div>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/v/903-1-1/");
        assertEquals(2, preview.episodes().size());
        assertEquals("https://www.yhdmtv.cc/v/903-1-2/", preview.episodes().get(1).sourceUrl());
        assertEquals("", preview.episodes().get(1).playbackUrl());
    }

    @Test
    public void bundledPcDetailFindsUnwrappedEpisodeLinks() {
        String html = "<h1>你的名字</h1><a href='/v/52685-1-1/'>第1集</a>" +
            "<a href='/v/52685-2-1/'>第1集 · 备用</a><a href='/v/52685-2-2/'>第2集</a>" +
            "<a href='/v/99999-1-1/'>另一部作品</a>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://yinghuadongman.org.cn/p/52685/");
        assertEquals(3, preview.episodes().size());
        assertEquals("https://yinghuadongman.org.cn/v/52685-2-2/", preview.episodes().get(2).sourceUrl());
    }

    @Test
    public void detailPosterAndPlaylistExcludeNavigation() {
        String html = "<h1>作品</h1><div class='video_img'><img src='https://www.mdzywtupian.com/upload/vod/cover.jpg'></div>" +
            "<a href='/v/52685-1-1/'>返回作品详情</a><a href='/v/52685-1-1/' onclick='play(this)'>正片</a>" +
            "<a href='/v/52685-2-2/' onclick='play(this)'>HD中字</a>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://yinghuadongman.org.cn/p/52685/");
        assertEquals("https://www.mdzywtupian.com/upload/vod/cover.jpg", preview.coverUrl());
        assertEquals(2, preview.episodes().size());
        assertEquals("正片", preview.episodes().get(0).title());
    }

    @Test
    public void previewDecodesPublicLinesAndIgnoresUnsafeMedia() {
        String good = "abc" + java.util.Base64.getEncoder().encodeToString("https%3A%2F%2Fmedia.example%2Fone.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String unsafe = "abc" + java.util.Base64.getEncoder().encodeToString("http%3A%2F%2Fprivate.example%2Ftwo.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String html = "<h1>作品</h1><script>var temLineList = [{\"id\":2,\"name\":\"线路甲\",\"LineList\":[],\"file\":\"" + good +
            "\"},{\"id\":3,\"file\":\"" + unsafe + "\"}]; var other = false;</script>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/v/903-1-2/");
        assertEquals(1, preview.episodes().size());
        assertEquals("https://media.example/one.m3u8", preview.episodes().get(0).playbackUrl());
        assertEquals("2", preview.episodes().get(0).lineId());
    }

    @Test
    public void episodeNamedLinesDoNotBecomeBackupPlaybackOptions() {
        String one = "abc" + java.util.Base64.getEncoder().encodeToString("https%3A%2F%2Fmedia.example%2Fone.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String two = "abc" + java.util.Base64.getEncoder().encodeToString("https%3A%2F%2Fmedia.example%2Ftwo.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String html = "<h1>作品</h1><script>var temLineList = [{\"id\":1,\"name\":\"第1集\",\"file\":\"" + one +
            "\"},{\"id\":2,\"name\":\"第2集\",\"file\":\"" + two + "\"}];</script>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/v/903-1-2/");
        assertEquals(1, preview.episodes().size());
        assertEquals("2", preview.episodes().get(0).lineId());
    }

    @Test
    public void placeholderEpisodeUrlKeepsAllRealLineEntries() {
        String one = "abc" + java.util.Base64.getEncoder().encodeToString("https%3A%2F%2Fmedia.example%2Fone.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String two = "abc" + java.util.Base64.getEncoder().encodeToString("https%3A%2F%2Fmedia.example%2Ftwo.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String html = "<h1>作品</h1><script>var temLineList = [{\"id\":10,\"name\":\"第01集\",\"file\":\"" + one
            + "\"},{\"id\":25,\"name\":\"第02集\",\"file\":\"" + two + "\"}];</script>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/p/844920/364/0");
        assertEquals(2, preview.episodes().size());
    }

    @Test
    public void playerConfigUnescapesUnicodeMediaPathLikePcRuntime() {
        String escapedEpisode = "\\" + "u7b2c01";
        String escapedSet = "\\" + "u96c6";
        String html = "<h1>作品</h1><script>var player_aaaa={\"url\":\"https://media.example/video/"
            + escapedEpisode + escapedSet + "/index.m3u8\"};</script>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://yinghuadongman.org.cn/v/41625-1-1/");
        assertEquals("https://media.example/video/第01集/index.m3u8", preview.episodes().get(0).playbackUrl());
    }

    @Test
    public void pcDetailRetainsEveryEpisodeAndItsSourcePanel() {
        StringBuilder html = new StringBuilder("<h1>作品</h1><div id='y-playList'>" +
            "<div class='module-tab-item' data-dropdown-value='加速云'></div>" +
            "<div class='module-tab-item' data-dropdown-value='火箭云'></div></div>");
        for (int panel = 0; panel < 2; panel++) {
            html.append("<div class='module-list' id='panel1'><div class='module-play-list'>");
            for (int episode = 1; episode <= 120; episode++) {
                html.append("<a href='/p/844920/364/").append(panel * 1000 + episode)
                    .append("'>第").append(episode).append("集</a>");
            }
            html.append("</div></div>");
        }
        var preview = SanyeSourcePlugin.parsePreview(html.toString(), "https://www.yhdmtv.cc/v/844920/364");
        assertEquals(240, preview.episodes().size());
        assertEquals("加速云", preview.episodes().get(119).lineId());
        assertEquals("火箭云", preview.episodes().get(120).lineId());
        assertEquals("第120集", preview.episodes().get(239).title());
    }

    @Test
    public void pcLateEpisodeResolvesItsOwnMediaInsteadOfAnEarlierEpisode() {
        StringBuilder html = new StringBuilder("<h1>作品</h1><div class='module-play-list'>");
        for (int episode = 1; episode <= 60; episode++) {
            html.append("<a href='/p/844920/364/").append(episode).append("'>第")
                .append(episode).append("集</a>");
        }
        html.append("</div><script>var temLineList = [");
        for (int episode = 1; episode <= 60; episode++) {
            if (episode > 1) html.append(',');
            String file = "abc" + java.util.Base64.getEncoder().encodeToString(
                ("https%3A%2F%2Fmedia.example%2F" + episode + ".m3u8").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            html.append("{\"id\":").append(episode).append(",\"name\":\"第")
                .append(episode).append("集\",\"file\":\"").append(file).append("\"}");
        }
        html.append("];</script>");
        var preview = SanyeSourcePlugin.parsePreview(html.toString(), "https://www.yhdmtv.cc/p/844920/364/60");
        assertEquals(60, preview.episodes().size());
        // 播放页只声明当前集（第 60 集）的线路：它必须拿到自己编号的地址，不能串到别的集。
        assertEquals("https://media.example/60.m3u8", preview.episodes().get(59).playbackUrl());
        assertEquals("", preview.episodes().get(0).playbackUrl());
        var unselected = SanyeSourcePlugin.parsePreview(html.toString(), "https://www.yhdmtv.cc/p/844920/364/0");
        // 占位播放页（`/0`）会列出整部作品的线路：按编号对齐后首屏一次请求就能拿到可播地址。
        assertEquals("https://media.example/1.m3u8", unselected.episodes().get(0).playbackUrl());
        assertEquals("https://media.example/60.m3u8", unselected.episodes().get(59).playbackUrl());
    }

    @Test
    public void lineListEntriesKeepTheirOwnEpisodeLabelsAndAddresses() {
        String national = "abc" + java.util.Base64.getEncoder().encodeToString(
            "https%3A%2F%2Fmedia.example%2Fnational.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String subtitled = "abc" + java.util.Base64.getEncoder().encodeToString(
            "https%3A%2F%2Fmedia.example%2Fsubtitled.m3u8".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        // 与来源实际结构一致：同一部作品的两条线路是选集列表里的两条条目。
        String html = "<h1>你的名字</h1><div class='module-play-list'>" +
            "<a href='/p/65395/153/4570086'>HD国语</a><a href='/p/65395/153/4570085'>HD中字</a></div>" +
            "<script>var temLineList = [{\"id\":4570086,\"name\":\"HD国语\",\"file\":\"" + national +
            "\"},{\"id\":4570085,\"name\":\"HD中字\",\"file\":\"" + subtitled + "\"}];</script>";
        var preview = SanyeSourcePlugin.parsePreview(html, "https://www.yhdmtv.cc/p/65395/153/0");
        assertEquals(2, preview.episodes().size());
        assertEquals("HD国语", preview.episodes().get(0).title());
        assertEquals("https://media.example/national.m3u8", preview.episodes().get(0).playbackUrl());
        assertEquals("HD中字", preview.episodes().get(1).title());
        assertEquals("https://media.example/subtitled.m3u8", preview.episodes().get(1).playbackUrl());
    }

    @Test
    public void panelTabsNameTheLinesEvenWhenEpisodesShareOneUrlLine() {
        // 与来源实测一致：三条线路（页签「加速云」「免费云」「火箭云」）的选集链接共用同一个
        // URL 线路段 `/p/<作品>/153/<条目id>`，只有线路名与条目 id 不同。
        String[] lines = {"加速云", "免费云", "火箭云"};
        StringBuilder html = new StringBuilder("<h1>无职转生</h1>" +
            "<div class='module-tab-items' id='playSwiper'>");
        for (String line : lines) html.append("<div class='swiper-slide module-tab-item'>").append(line).append("</div>");
        html.append("</div>");
        for (int panel = 0; panel < lines.length; panel++) {
            html.append("<div class='module-list sort-list' id='panel").append(panel).append("'><div class='module-play-list'>");
            for (int episode = 1; episode <= 2; episode++) {
                html.append("<a href='/p/210580/153/").append(4600000 + panel * 100 + episode)
                    .append("'><span>第0").append(episode).append("集</span></a>");
            }
            html.append("</div></div>");
        }
        var preview = SanyeSourcePlugin.parsePreview(html.toString(), "https://www.yhdmtv.cc/v/210580/153");
        assertEquals(6, preview.episodes().size());
        // 每条线路的条目都要带上自己的线路名，客户端才能把三条线路分成三张列表。
        assertEquals("加速云", preview.episodes().get(0).lineId());
        assertEquals("免费云", preview.episodes().get(2).lineId());
        assertEquals("火箭云", preview.episodes().get(4).lineId());
        assertEquals("第01集", preview.episodes().get(0).title());
        assertEquals("第02集", preview.episodes().get(1).title());
    }

    @Test
    public void searchRaceDoesNotShareTheHydrationPool() throws Exception {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        // 首集媒体探测会长时间占用自己的线程（阻塞式 HTTP 读无法被中断）；
        // 搜索若与它共用队列，连点两次搜索的第二次就会排在探测之后并超时成“搜不到”。
        List<java.util.concurrent.Future<?>> busy = new java.util.ArrayList<>();
        for (int index = 0; index < 3; index++) {
            busy.add(plugin.hydrationExecutor().submit(() -> {
                try { Thread.sleep(2_000); } catch (InterruptedException ignored) { /* 测试结束 */ }
            }));
        }
        long started = System.nanoTime();
        var raced = plugin.searchRaceExecutor().submit(() -> "ok");
        assertEquals("ok", raced.get(1, java.util.concurrent.TimeUnit.SECONDS));
        assertTrue("搜索竞速不得排在首集探测之后", System.nanoTime() - started < 500_000_000L);
        for (var task : busy) task.cancel(true);
    }

    @Test
    public void searchRaceAlsoAvoidsThePreviewPool() throws Exception {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        // 并发详情预览可以占满预览池（6 条线程）：搜索若排在同一个池里，
        // 连任务都排不上，界面只能一直停在「读取中」直到整体期限（VQ-56）。
        List<java.util.concurrent.Future<?>> busy = new java.util.ArrayList<>();
        for (int index = 0; index < 6; index++) {
            busy.add(plugin.searchExecutor().submit(() -> {
                try { Thread.sleep(2_000); } catch (InterruptedException ignored) { /* 测试结束 */ }
            }));
        }
        long started = System.nanoTime();
        var raced = plugin.searchRaceExecutor().submit(() -> "ok");
        assertEquals("ok", raced.get(1, java.util.concurrent.TimeUnit.SECONDS));
        assertTrue("搜索不得排在预览池之后", System.nanoTime() - started < 500_000_000L);
        for (var task : busy) task.cancel(true);
    }

    @Test
    public void searchRaceReportsUnavailableWhenEveryEntryFails() {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        var outcome = plugin.raceSearch(System.nanoTime() + 1_000_000_000L, List.of(
            () -> { throw new java.io.IOException("入口一不可达"); },
            () -> { throw new java.io.IOException("入口二不可达"); }));
        // 两个入口都失败＝来源不可用：必须带失败原因，界面才会显示「暂不可用」并触发一次静默重试，
        // 而不是被当成「没有找到匹配作品」（VQ-56）。
        assertTrue("来源不可用时必须带失败原因", outcome.failure() != null);
        assertTrue(outcome.hits().isEmpty());
    }

    @Test
    public void searchRaceKeepsEmptyResultWhenOneEntryAnswered() {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        var outcome = plugin.raceSearch(System.nanoTime() + 1_000_000_000L, List.of(
            () -> { throw new java.io.IOException("入口一不可达"); },
            () -> List.<SanyeSourcePlugin.SearchHit>of()));
        // 有一个入口真的返回了页面（哪怕 0 条）＝确实没有匹配：这不是错误，
        // 否则界面会把来源抖动和真的没有结果混在一起。
        assertTrue("可达入口的空结果不是错误", outcome.failure() == null);
        assertTrue(outcome.hits().isEmpty());
    }

    @Test
    public void searchRaceKeepsTheFirstNonEmptyEntry() {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        var hit = new SanyeSourcePlugin.SearchHit("作品", "https://www.yhdmtv.cc/p/1", "", "");
        var outcome = plugin.raceSearch(System.nanoTime() + 1_000_000_000L, List.of(
            () -> List.<SanyeSourcePlugin.SearchHit>of(),
            () -> List.of(hit)));
        assertEquals(List.of(hit), outcome.hits());
        assertTrue(outcome.failure() == null);
    }

    @Test
    public void previewCacheEvictsTheOldestEntryInsteadOfClearingEverything() {
        SanyeSourcePlugin plugin = new SanyeSourcePlugin();
        var preview = new SanyeSourcePlugin.SourcePreview("作品", "https://www.yhdmtv.cc/p/1", "", "", List.of());
        for (int index = 0; index < 30; index++) plugin.rememberPreview("https://www.yhdmtv.cc/p/" + index, preview);
        // 超过上限时只淘汰最快过期的一条：以前满 24 条就整表 clear()，
        // 浏览超过 24 部作品会把刚看过的热点也一起丢掉。
        assertEquals(24, plugin.previewCacheSize());
    }

    @Test
    public void previewWithoutAnyTitleStillReturnsEpisodes() {
        // 页面改版只剩播放器配置时，标题缺失不再让整次预览失败（VQ-56）；
        // 标题缺省为空串，由客户端用搜索命中或已保存作品的标题补上。
        var preview = SanyeSourcePlugin.parsePreview(
            "<script>var player_aaaa={url:'https:\\/\\/media.example.org\\/episode.m3u8'};</script>",
            "https://www.yhdmtv.cc/p/123/153/0");
        assertEquals("", preview.title());
        assertEquals("https://media.example.org/episode.m3u8", preview.episodes().get(0).playbackUrl());
    }
}
