package com.sanye.sanye_anime;

import org.junit.Test;
import com.google.gson.*;
import static org.junit.Assert.*;

public class SubscriptionSourceEngineTest {
    @Test public void selectedRuleFetchesOnlyItsOriginalArrayIndex() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        JsonObject selected = sources.get(0).getAsJsonObject().deepCopy();
        selected.getAsJsonObject("arguments").getAsJsonObject("searchConfig").addProperty("searchUrl", "https://example.com/selected?q={keyword}");
        JsonObject unsupported = selected.deepCopy(); unsupported.addProperty("factoryId", "unsupported");
        sources.add(unsupported); sources.add(selected);
        var requests = new java.util.concurrent.CopyOnWriteArrayList<String>();
        var engine = new SubscriptionSourceEngine(url -> { requests.add(url); return "<h2><a href='/work'>作品</a></h2>"; });
        JsonObject result = engine.search(root.toString(), "作品", 2, ignored -> {}, System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(2), 4);
        assertEquals(1, requests.size()); assertTrue(requests.get(0).contains("/selected?"));
        assertEquals(1, result.get("total").getAsInt());
        assertEquals(2, result.getAsJsonArray("hits").get(0).getAsJsonObject().get("sourceIndex").getAsInt());
        for (int index : new int[]{-1, 1, 3}) assertThrows(IllegalArgumentException.class,
                () -> engine.search(root.toString(), "作品", index, ignored -> {}, System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(2), 4));
        assertEquals("无效索引不得触发任何来源请求", 1, requests.size());
    }
    @Test public void mediaHeadersPreserveRefererAndUserAgentWithoutForwardingCredentials() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonObject config = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources")
                .get(0).getAsJsonObject().getAsJsonObject("arguments").getAsJsonObject("searchConfig");
        JsonObject match = new JsonObject(), headers = new JsonObject();
        headers.addProperty("referer", "https://example.com/play/1"); headers.addProperty("userAgent", "Mozilla/5.0");
        headers.addProperty("Cookie", "secret"); match.add("addHeadersToVideo", headers); config.add("matchVideo", match);
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<video src='https://media.example.com/video.m3u8'></video>",
                host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
        JsonObject result = engine.resolve(root.toString(), "https://example.com/play/1").getAsJsonObject("requestHeaders");
        assertEquals(2, result.size()); assertEquals("https://example.com/play/1", result.get("Referer").getAsString());
        assertEquals("Mozilla/5.0", result.get("User-Agent").getAsString()); assertFalse(result.has("Cookie"));
        headers.addProperty("userAgent", "UA\nCookie: injected");
        assertThrows(IllegalArgumentException.class, () -> engine.resolve(root.toString(), "https://example.com/play/1"));
    }
    @Test public void episodeNamesBelongToTheirAnchorInsteadOfParallelArrayIndex() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonObject selectors = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources")
                .get(0).getAsJsonObject().getAsJsonObject("arguments").getAsJsonObject("searchConfig").getAsJsonObject("selectorChannelFormatNoChannel");
        selectors.addProperty("selectEpisodes", "ul a span"); selectors.addProperty("selectEpisodeLinks", "ul a");
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<ul><a href='/one'><span>全集</span><span>字幕</span></a><a href='/two'><span>HD</span></a><a href='/empty'>无匹配名称</a></ul>");
        JsonArray episodes = engine.preview(root.toString(), "https://example.com/work").getAsJsonArray("episodes");
        assertEquals(2, episodes.size());
        assertEquals("全集 字幕", episodes.get(0).getAsJsonObject().get("title").getAsString());
        assertEquals("https://example.com/two", episodes.get(1).getAsJsonObject().get("sourceUrl").getAsString());
        assertEquals("HD", episodes.get(1).getAsJsonObject().get("title").getAsString());
    }

    @Test public void staticPlayerJsonDecodesEscapedPercentAndBase64Urls() throws Exception {
        String address = "https://media.example.com/ep.m3u8?token=a+b%26c";
        String encoded = java.net.URLEncoder.encode(address, java.nio.charset.StandardCharsets.UTF_8);
        String base64 = java.util.Base64.getEncoder().encodeToString(encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        for (String value : new String[]{address, encoded, base64}) {
            JsonObject player = new JsonObject(); player.addProperty("url", value); player.addProperty("note", "escaped braces } and quote \"");
            String html = "<script>var player_aaaa=" + player.toString().replace("/", "\\/") + ";</script>";
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> html,
                    host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
            assertEquals(address, engine.resolve(config("a", "no-channel"), "https://example.com/play").get("playbackUrl").getAsString());
        }
    }

    @Test public void cancellingRealBlockedSocketsReleasesAllFourNetworkSlots() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        for (int i = 0; i < 3; i++) sources.add(sources.get(0).deepCopy());
        var reading = new java.util.concurrent.CountDownLatch(4);
        var stopped = new java.util.concurrent.CountDownLatch(4);
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        try (var server = new java.net.ServerSocket(0, 8, java.net.InetAddress.getLoopbackAddress())) {
            var engine = new SubscriptionSourceEngine(url -> {
                try (var socket = new java.net.Socket(java.net.InetAddress.getLoopbackAddress(), server.getLocalPort())) {
                    socket.setSoTimeout(SubscriptionFetchPolicy.TIMEOUT_MILLIS);
                    var cancellation = SubscriptionFetchPolicy.closeOnInterrupt(socket, Thread.currentThread());
                    try {
                        reading.countDown();
                        return SubscriptionFetchPolicy.readResponse(socket.getInputStream(), () -> {});
                    } finally { cancellation.cancel(false); }
                } finally { stopped.countDown(); }
            });
            var search = pool.submit(() -> engine.search(root.toString(), "旧词"));
            assertTrue(reading.await(1, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(stopped.await(50, java.util.concurrent.TimeUnit.MILLISECONDS));
            search.cancel(true);
            assertTrue("取消应终止四个真实阻塞读取", stopped.await(1, java.util.concurrent.TimeUnit.SECONDS));
            var replacement = new SubscriptionSourceEngine(url -> "<h2><a href='/work/1'>作品</a></h2>");
            var fresh = pool.submit(() -> replacement.search(root.toString(), "新词"));
            assertEquals("新搜索应立刻取得已释放的网络槽，保留四条规则的命中", 4,
                    fresh.get(1, java.util.concurrent.TimeUnit.SECONDS).getAsJsonArray("hits").size());
        } finally { pool.shutdownNow(); }
    }

    @Test public void deadlineRetainsFastResultsAndCancelsSlowSource() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        var slow = sources.get(0).getAsJsonObject().deepCopy();
        slow.getAsJsonObject("arguments").getAsJsonObject("searchConfig").addProperty("searchUrl", "https://example.com/slow?q={keyword}");
        sources.add(slow);
        var stopped = new java.util.concurrent.CountDownLatch(1);
        var engine = new SubscriptionSourceEngine(url -> {
            if (url.contains("/slow")) {
                try { new java.util.concurrent.CountDownLatch(1).await(); }
                finally { stopped.countDown(); }
            }
            return "<h2><a href='/work/1'>作品</a></h2>";
        });
        var result = engine.search(root.toString(), "作品", ignored -> {},
                System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(500), 4);
        assertEquals(1, result.getAsJsonArray("hits").size());
        assertEquals(1, result.get("completed").getAsInt());
        assertEquals(1, result.getAsJsonArray("warnings").size());
        assertTrue(stopped.await(1, java.util.concurrent.TimeUnit.SECONDS));
    }
    @Test public void expiredSearchDoesNotIssueAnySourceRequest() throws Exception {
        var requests = new java.util.concurrent.atomic.AtomicInteger();
        var engine = new SubscriptionSourceEngine(url -> { requests.incrementAndGet(); return ""; });
        try {
            engine.search(config("a", "no-channel"), "作品", ignored -> {}, System.nanoTime() - 1, 4);
            fail("过期搜索应失败");
        } catch (java.util.concurrent.TimeoutException expected) { assertEquals(0, requests.get()); }
    }

    @Test public void cancellationStopsQueuedSourcesAndProgress() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        for (int i = 0; i < 8; i++) sources.add(sources.get(0).deepCopy());
        var started = new java.util.concurrent.CountDownLatch(1);
        var stopped = new java.util.concurrent.CountDownLatch(1);
        var requests = new java.util.concurrent.atomic.AtomicInteger();
        var progress = new java.util.concurrent.atomic.AtomicInteger();
        var engine = new SubscriptionSourceEngine(url -> {
            requests.incrementAndGet(); started.countDown();
            try { new java.util.concurrent.CountDownLatch(1).await(); }
            finally { stopped.countDown(); }
            return "";
        });
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            var search = pool.submit(() -> engine.search(root.toString(), "作品", ignored -> progress.incrementAndGet(),
                    System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10), 1));
            assertTrue(started.await(1, java.util.concurrent.TimeUnit.SECONDS)); search.cancel(true);
            assertTrue(stopped.await(1, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(1, requests.get()); assertEquals(0, progress.get());
        } finally { pool.shutdownNow(); }
    }
    @Test public void coversComeFromMatchingCardAndResponseTimingIsMeasured() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<meta property='og:image' content='https://img.example.com/poster.jpg'><article><h2><a href='/work/1'>作品</a></h2><img data-src='https://img.example.com/card.jpg'></article><article><img src='https://img.example.com/unrelated.jpg'></article>");
        JsonObject hit = engine.search(config("a", "no-channel"), "作品").getAsJsonArray("hits").get(0).getAsJsonObject();
        assertEquals("https://img.example.com/card.jpg", hit.get("coverUrl").getAsString());
        assertTrue(hit.get("responseMs").getAsLong() >= 0);
        assertEquals("https://img.example.com/poster.jpg", engine.preview(config("a", "no-channel"), "https://example.com/work/1").get("coverUrl").getAsString());
    }
    @Test public void sharedAncestorDoesNotLendAnotherWorksCoverAndLazySourceIsSupported() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<section><h2><a href='/work/1'>无图作品</a></h2><h2><a href='/work/2'>另一作品</a></h2><img src='https://img.example.com/other.jpg'></section><article><h2><a href='/work/3'>懒加载作品</a></h2><img data-lazy-src='https://img.example.com/lazy.jpg'></article>");
        JsonArray hits = engine.search(config("a", "no-channel"), "作品").getAsJsonArray("hits");
        assertEquals("", hits.get(0).getAsJsonObject().get("coverUrl").getAsString());
        assertEquals("", hits.get(1).getAsJsonObject().get("coverUrl").getAsString());
        assertEquals("https://img.example.com/lazy.jpg", hits.get(2).getAsJsonObject().get("coverUrl").getAsString());
    }
    @Test public void detailAndPlaybackLinksWithinOneCardKeepItsCover() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<li><a href='/work/1'><img data-original='/poster.jpg'></a><div><h2><a href='/work/1'>作品</a></h2><a href='/play/1'>播放</a><a href='/genre'>类型</a></div></li><li><h2><a href='/work/2'>无图作品</a></h2></li>");
        for (String format : new String[]{"a", "indexed"}) {
            JsonArray hits = engine.search(config(format, "no-channel"), "作品").getAsJsonArray("hits");
            assertEquals("https://example.com/poster.jpg", hits.get(0).getAsJsonObject().get("coverUrl").getAsString());
            assertEquals("", hits.get(1).getAsJsonObject().get("coverUrl").getAsString());
        }
    }
    @Test public void thumbnailAnchorsSupportLazyBackgroundPosters() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<li><a href='/work/1' data-original='/poster.jpg'></a><div><h2><a href='/work/1'>作品</a></h2><a href='/play/1'>播放</a></div></li>");
        assertEquals("https://example.com/poster.jpg", engine.search(config("a", "no-channel"), "作品").getAsJsonArray("hits").get(0).getAsJsonObject().get("coverUrl").getAsString());
    }
    @Test public void detailPostersStayInsideTheMainWorkContainer() throws Exception {
        String[] pages = {
            "<div class='col-pd clearfix'><div class='stui-content__thumb'><a href='/play'><img src='/load.gif' data-original='/poster.jpg'></a></div><div class='stui-content__detail'><h1>作品</h1><img src='/icon.png'></div></div><article><img src='/other.jpg'></article>",
            "<div class='fire'><div class='thumb'><a href='/play'>播放</a><img src='/poster.jpg'></div><div class='rate'><h1>作品</h1></div></div><div class='fire'><div class='thumb'><img src='/other.jpg'></div><h2>其他作品</h2></div>"
        };
        for (String page : pages) {
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> page);
            assertEquals("https://example.com/poster.jpg", engine.preview(config("a", "no-channel"), "https://example.com/work/1").get("coverUrl").getAsString());
        }
        SubscriptionSourceEngine missing = new SubscriptionSourceEngine(url -> "<div class='fire'><h1>无图作品</h1></div><div class='fire'><div class='thumb'><img src='/other.jpg'></div><h2>其他作品</h2></div>");
        assertEquals("", missing.preview(config("a", "no-channel"), "https://example.com/work/1").get("coverUrl").getAsString());
    }
    @Test public void detailSummaryUsesPageContentThenMetadataWithoutInventingText() throws Exception {
        String[] pages = {
            "<h1>作品</h1><div class='stui-content__desc'><p>第一段故事。</p><p>第二段故事。</p></div><meta name='description' content='站点简介'>",
            "<h1>作品</h1><div class='module-info-introduction-content'>第一段故事。 第二段故事。</div>",
            "<h1>作品</h1><article itemprop='description'>第一段故事。 第二段故事。</article>",
            "<h1>作品</h1><div class='stui-pannel'><div class='stui-pannel__head'><h3>剧情简介</h3></div><div class='stui-pannel_bd'><p class='col-pd'>第一段故事。 第二段故事。</p></div></div><meta name='description' content='截断简介'>",
            "<meta property='og:description' content='第一段故事。 第二段故事。'><meta name='description' content='站点简介'>"
        };
        for (String page : pages) {
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> page);
            assertEquals("第一段故事。 第二段故事。", engine.preview(config("a", "no-channel"), "https://example.com/work/1").get("summary").getAsString());
        }
        for (String page : new String[]{"<h1>作品</h1><p>没有标记的普通内容</p>",
                "<h1>作品</h1><aside><div itemprop='description'>其他作品简介</div></aside>",
                "<h1>作品</h1><div class='stui-content__desc'>作品一</div><div class='stui-content__desc'>作品二</div>",
                "<h1>作品</h1><div class='stui-pannel'><div class='stui-pannel__head'><h3>剧情简介</h3></div><div class='stui-pannel_bd'><p class='col-pd'>作品一</p></div></div><div class='stui-pannel'><div class='stui-pannel__head'><h3>剧情简介</h3></div><div class='stui-pannel_bd'><p class='col-pd'>作品二</p></div></div>"}) {
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> page);
            assertEquals("", engine.preview(config("a", "no-channel"), "https://example.com/work/1").get("summary").getAsString());
        }
        SubscriptionSourceEngine bounded = new SubscriptionSourceEngine(url -> "<meta name='description' content='" + "文".repeat(5000) + "'>");
        assertEquals(4000, bounded.preview(config("a", "no-channel"), "https://example.com/work/1").get("summary").getAsString().length());
    }
    @Test public void fourSearchesRunInParallelAndPublishBeforeSlowSourcesFinish() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        JsonObject template = sources.get(0).getAsJsonObject().deepCopy(); sources.remove(0);
        for (int i = 0; i < 4; i++) {
            JsonObject source = template.deepCopy();
            source.getAsJsonObject("arguments").getAsJsonObject("searchConfig").addProperty("searchUrl", "https://example.com/search/" + i + "?q={keyword}");
            sources.add(source);
        }
        var started = new java.util.concurrent.CountDownLatch(4);
        var release = new java.util.concurrent.CountDownLatch(1);
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> {
            started.countDown();
            assertTrue("四个来源应同时发出", started.await(2, java.util.concurrent.TimeUnit.SECONDS));
            if (!url.contains("/3?")) assertTrue("慢源应在首次进度后继续完成", release.await(2, java.util.concurrent.TimeUnit.SECONDS));
            String id = url.substring(url.indexOf("/search/") + 8, url.indexOf('?'));
            return "<h2><a href='/work/" + id + "'>作品" + id + "</a></h2>";
        });
        var snapshots = new java.util.ArrayList<JsonObject>();
        JsonObject result = engine.search(root.toString(), "作品", progress -> {
            snapshots.add(progress);
            if (progress.get("completed").getAsInt() == 1) {
                assertEquals(1, progress.getAsJsonArray("hits").size());
                assertEquals(4, progress.get("total").getAsInt());
                release.countDown();
            }
        });
        assertEquals(4, result.getAsJsonArray("hits").size());
        assertEquals(4, result.get("completed").getAsInt());
        assertEquals("进度快照不随后续结果改写", 1, snapshots.get(0).getAsJsonArray("hits").size());
    }
    @Test public void partialFailurePreservesSuccessfulHitsAndReportsProgress() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        JsonObject failing = sources.get(0).getAsJsonObject().deepCopy();
        failing.getAsJsonObject("arguments").getAsJsonObject("searchConfig").addProperty("searchUrl", "https://example.com/fail?q={keyword}");
        sources.add(failing); sources.add(sources.get(0).deepCopy());
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> {
            if (url.contains("/fail")) throw new java.io.IOException("断网");
            return "<h2><a href='/work/1'>作品</a></h2>";
        });
        var snapshots = new java.util.ArrayList<JsonObject>();
        JsonObject result = engine.search(root.toString(), "作品", snapshots::add);
        assertEquals(2, result.getAsJsonArray("hits").size());
        assertEquals(1, result.getAsJsonArray("warnings").size());
        assertEquals(3, result.get("completed").getAsInt());
        assertEquals(3, snapshots.size());
    }
    private static String config(String subject, String channel) {
        return """
            {"exportedMediaSourceDataList":{"mediaSources":[{"factoryId":"web-selector","version":2,
              "arguments":{"name":"测试源","searchConfig":{"searchUrl":"https://example.com/search?q={keyword}",
              "subjectFormatId":"%s","selectorSubjectFormatA":{"selectLists":"h2 a"},
              "selectorSubjectFormatIndexed":{"selectNames":"h2","selectLinks":"h2 a"},
              "channelFormatId":"%s","selectorChannelFormatFlattened":{"selectChannelNames":"h3","selectEpisodeLists":"ul","selectEpisodesFromList":"a"},
              "selectorChannelFormatNoChannel":{"selectEpisodes":"ul a"}}}}]}}
            """.formatted(subject, channel);
    }
    @Test public void exactRuleIdentityPreservesSameUrlAndOriginalArrayIndex() throws Exception {
        JsonObject root = JsonParser.parseString(config("a", "no-channel")).getAsJsonObject();
        JsonArray sources = root.getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        JsonObject first = sources.get(0).getAsJsonObject().deepCopy();
        JsonObject second = first.deepCopy();
        second.getAsJsonObject("arguments").addProperty("name", "第二规则");
        second.getAsJsonObject("arguments").getAsJsonObject("searchConfig")
                .getAsJsonObject("selectorChannelFormatNoChannel").addProperty("selectEpisodes", "ol a");
        JsonObject matchVideo = new JsonObject(); matchVideo.addProperty("cookies", "需要额外请求头");
        second.getAsJsonObject("arguments").getAsJsonObject("searchConfig").add("matchVideo", matchVideo);
        JsonObject unsupported = first.deepCopy(); unsupported.addProperty("factoryId", "unsupported");
        sources.remove(0); sources.add(unsupported); sources.add(first); sources.add(second);
        var engine = new SubscriptionSourceEngine(url -> "<h2><a href='/work'>作品</a><a href='/work'>作品</a></h2><ul><a href='/first'>第一集</a></ul><ol><a href='/second'>第二集</a></ol><video src='https://media.example.com/ep.mp4'></video>",
                host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
        JsonArray hits = engine.search(root.toString(), "作品").getAsJsonArray("hits");
        assertEquals("同规则同URL去重，不同规则同URL保留", 2, hits.size());
        var indexes = new java.util.HashSet<Integer>();
        for (JsonElement hit : hits) indexes.add(hit.getAsJsonObject().get("sourceIndex").getAsInt());
        assertEquals(java.util.Set.of(1, 2), indexes);
        JsonObject preview = engine.preview(root.toString(), "https://example.com/work", 2);
        assertEquals("第二规则", preview.get("sourceName").getAsString());
        assertEquals(2, preview.get("sourceIndex").getAsInt());
        JsonObject episode = preview.getAsJsonArray("episodes").get(0).getAsJsonObject();
        assertEquals("https://example.com/second", episode.get("sourceUrl").getAsString());
        assertEquals(2, episode.get("sourceIndex").getAsInt());
        assertEquals(2, engine.resolve(root.toString(), "https://example.com/second", 2).get("sourceIndex").getAsInt());
        assertEquals(1, engine.resolve(root.toString(), "https://example.com/second", 2).getAsJsonArray("warnings").size());
        assertEquals(0, engine.resolve(root.toString(), "https://example.com/first", 1).getAsJsonArray("warnings").size());
        for (boolean resolve : new boolean[]{false, true}) {
            try {
                if (resolve) engine.resolve(root.toString(), "https://example.com/work");
                else engine.preview(root.toString(), "https://example.com/work");
                fail("无索引不能静默选择同主机第一条规则");
            } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("多个来源")); }
        }
        for (int index : new int[]{-1, 0, 3, Integer.MAX_VALUE}) {
            try { engine.preview(root.toString(), "https://example.com/work", index); fail("非法/不支持索引应拒绝"); }
            catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("索引无效")); }
            try { engine.resolve(root.toString(), "https://example.com/work", index); fail("非法/不支持索引应拒绝"); }
            catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("索引无效")); }
        }
        for (boolean resolve : new boolean[]{false, true}) {
            try {
                if (resolve) engine.resolve(root.toString(), "https://other.example.com/work", 2);
                else engine.preview(root.toString(), "https://other.example.com/work", 2);
                fail("精确索引不得放松主机归属");
            } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("不属于")); }
        }
    }
    @Test public void realCssSubjectFormatsAndGroupedEpisodes() throws Exception {
        String html = "<h2><a href='/work/1'>作品</a></h2><h3>主线</h3><ul><li><a href='/episode/1'>第1集</a></li></ul>";
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> html);
        for (String subject : new String[]{"a", "indexed"}) {
            String config = config(subject, "index-grouped");
            JsonArray hits = engine.search(config, "作品").getAsJsonArray("hits");
            assertEquals("https://example.com/work/1", hits.get(0).getAsJsonObject().get("sourceUrl").getAsString());
            JsonObject episode = engine.preview(config, "https://example.com/work/1").getAsJsonArray("episodes").get(0).getAsJsonObject();
            assertEquals("主线", episode.get("lineId").getAsString());
            assertEquals(0, episode.get("sourceIndex").getAsInt());
            assertEquals("", episode.get("playbackUrl").getAsString());
            assertEquals("https://example.com/episode/1", episode.get("sourceUrl").getAsString());
        }
    }
    @Test public void noChannelAndRejectedTargets() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<ul><a href='/ep'>第2集</a><a href='http://127.0.0.1/x'>恶意</a></ul>");
        String config = config("a", "no-channel");
        assertEquals(1, engine.preview(config, "https://example.com/work").getAsJsonArray("episodes").size());
        try { engine.preview(config, "https://other.example.com/work"); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("不属于")); }
        try { engine.search(config("jsonpath-indexed", "no-channel"), "作品"); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("JSONPath")); }
    }
    @Test public void rssResourceIsNotVideo() throws Exception {
        String config = """
            {"exportedMediaSourceDataList":{"mediaSources":[{"factoryId":"rss","version":1,"arguments":{"name":"BT","searchConfig":{"searchUrl":"https://example.com/rss?q={keyword}"}}}]}}
            """;
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<rss><channel><item><title>作品</title><link>https://example.com/item</link><enclosure url='magnet:?xt=urn:btih:abc'/></item></channel></rss>");
        JsonObject hit = engine.search(config, "作品").getAsJsonArray("hits").get(0).getAsJsonObject();
        assertEquals("resource", hit.get("kind").getAsString()); assertTrue(hit.get("resourceUrl").getAsString().startsWith("magnet:"));
    }
    @Test public void scriptOnlyPlayerFailsWithoutDroppingEpisodes() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<script>eval('video')</script><ul><a href='/ep'>第1集</a></ul>");
        String config = config("a", "no-channel");
        assertEquals(1, engine.preview(config, "https://example.com/work").getAsJsonArray("episodes").size());
        try { engine.resolve(config, "https://example.com/ep"); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("静态媒体")); }
    }
    @Test public void multiplePlayerConfigsDecodeActualMediaWithoutExecutingScripts() throws Exception {
        String media = "https://media.example.com/ep.m3u8?token=1";
        String encoded = java.util.Base64.getEncoder().encodeToString(media.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        for (String value : new String[]{encoded, java.net.URLEncoder.encode(media, "UTF-8")}) {
            String html = "<script>var player_ads={\"url\":\"https://ads.example.com/widget\"};"
                    + "var player_bbbb={\"url\":\"" + value + "\",\"meta\":{\"title\":\"brace } inside string\"}};</script>";
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> html,
                    host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
            assertEquals(media, engine.resolve(config("a", "no-channel"), "https://example.com/ep").get("playbackUrl").getAsString());
        }
    }

    @Test public void staticMediaIsResolvedAndPrivateMediaIsRejected() throws Exception {
        String config = config("a", "no-channel");
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<video><source src='https://media.example.com/ep.m3u8?token=1'></video>",
            host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
        assertEquals("https://media.example.com/ep.m3u8?token=1", engine.resolve(config, "https://example.com/ep").get("playbackUrl").getAsString());
        SubscriptionSourceEngine unsafe = new SubscriptionSourceEngine(url -> "<video src='https://media.example.com/ep.mp4'></video>",
            host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("127.0.0.1")});
        try { unsafe.resolve(config, "https://example.com/ep"); fail(); } catch (java.util.concurrent.ExecutionException expected) { assertTrue(expected.getCause().getMessage().contains("内网")); }
        try { unsafe.resolve(config, "https://example.com/ep", 0); fail(); } catch (java.util.concurrent.ExecutionException expected) { assertTrue(expected.getCause().getMessage().contains("内网")); }
    }
}
