package com.sanye.anime.sanye_search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_core.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.net.InetAddress;
import java.net.URI;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SubscriptionPlaybackServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    @Test
    @EnabledIfEnvironmentVariable(named = "SANYE_LIVE_SUBSCRIPTION", matches = "1")
    void configuredSourceSearchPreviewAndResolveAreUsableToday() throws Exception {
        var root = mapper.readTree(
                SubscriptionFetchPolicy.fetch("https://sub.creamycake.org/v1/css1.json"));
        var sources = root.path("exportedMediaSourceDataList").path("mediaSources");
        int sourceIndex = -1;
        for (int index = 0; index < sources.size(); index++) {
            if ("wedm".equals(sources.get(index).path("arguments").path("name").asText())) { sourceIndex = index; break; }
        }
        assertTrue(sourceIndex >= 0, "当前默认来源不在订阅中");
        String content = mapper.writeValueAsString(root);
        var service = new SubscriptionPlaybackService(mapper);
        var hits = service.search(content, "无职转生", 10, sourceIndex);
        assertFalse(hits.isEmpty(), "默认来源搜索没有作品");
        var preview = service.preview(content, hits.getFirst().sourceUrl(), hits.getFirst().title(), sourceIndex);
        assertFalse(preview.episodes().isEmpty(), "搜索作品没有选集");
        var playable = service.resolve(content, preview.episodes().getFirst().sourcePageUrl(), sourceIndex);
        assertTrue(playable.url().startsWith("https://"), "未解析到公网 HTTPS 媒体");
        assertFalse(playable.mimeType().isBlank(), "媒体类型缺失");
    }
    private String config(String format, String channels, String selector) throws Exception {
        var search = new LinkedHashMap<String, Object>();
        search.put("searchUrl", "https://public.example/search?q={keyword}");
        search.put("subjectFormatId", format);
        search.put("selectorSubjectFormatA", Map.of("selectLists", selector));
        search.put("selectorSubjectFormatIndexed", Map.of("selectNames", ".name", "selectLinks", ".link"));
        search.put("channelFormatId", channels);
        search.put("selectorChannelFormatFlattened", Map.of("selectChannelNames", ".channel", "selectEpisodeLists", ".list", "selectEpisodesFromList", "a"));
        search.put("selectorChannelFormatNoChannel", Map.of("selectEpisodes", ".episode"));
        search.put("matchVideo", Map.of("cookies", "quality=1080", "addHeadersToVideo", Map.of("referer", "")));
        return mapper.writeValueAsString(Map.of("exportedMediaSourceDataList", Map.of("mediaSources", List.of(Map.of("factoryId", "web-selector", "version", 2, "arguments", Map.of("name", "测试来源", "searchConfig", search))))));
    }
    private SubscriptionPlaybackService service(Map<String, String> pages, List<String> reads) {
        return new SubscriptionPlaybackService(mapper, url -> {
            reads.add(url);
            if (!pages.containsKey(url)) throw new java.io.IOException("没有页面");
            return pages.get(url);
        }, url -> SubscriptionFetchPolicy.resolvePublic(URI.create(url), host -> new InetAddress[]{InetAddress.getByName("8.8.8.8")}));
    }
    @Test
    void selectedRuleKeepsSameHostSearchPreviewAndResolveSeparate() throws Exception {
        var first = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(config("a", "no-channel", ".first"))
            .path("exportedMediaSourceDataList").path("mediaSources").get(0).deepCopy();
        var second = first.deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) second.path("arguments")).put("name", "第二规则");
        ((com.fasterxml.jackson.databind.node.ObjectNode) second.path("arguments").path("searchConfig")
            .path("selectorSubjectFormatA")).put("selectLists", ".second");
        ((com.fasterxml.jackson.databind.node.ObjectNode) second.path("arguments").path("searchConfig")
            .path("selectorChannelFormatNoChannel")).put("selectEpisodes", ".other-episode");
        var root = mapper.createObjectNode();
        var list = root.putObject("exportedMediaSourceDataList").putArray("mediaSources");
        list.add(first); list.add(second);
        String content = mapper.writeValueAsString(root);
        var svc = service(Map.of(
            "https://public.example/search?q=word", "<a class='first' href='/first'>旧作品</a><a class='second' href='/second'>新作品</a>",
            "https://public.example/second", "<a class='episode' href='/old-play'>旧集</a><a class='other-episode' href='/new-play'>新集</a>",
            "https://public.example/new-play", "<video src='https://cdn.example/new.mp4'></video>"), new ArrayList<>());
        assertEquals("新作品", svc.search(content, "word", 10, 1).getFirst().title());
        var preview = svc.preview(content, "https://public.example/second", "新作品", 1);
        assertEquals("新集", preview.episodes().getFirst().title());
        assertEquals("https://cdn.example/new.mp4", svc.resolve(content, preview.episodes().getFirst().sourcePageUrl(), 1).url());
        assertThrows(BusinessException.class, () -> svc.preview(content, "https://public.example/second", "新作品", 2));
        assertThrows(BusinessException.class, () -> svc.preview(content, "https://public.example/second", "新作品"));
    }
    @Test
    void aSearchGroupedPreviewAndStaticPlaybackNeverReturnPageAsVideo() throws Exception {
        var reads = new ArrayList<String>();
        var svc = service(Map.of(
                "https://public.example/search?q=%E6%B5%8B%E8%AF%95", "<a class='hit' href='/detail'>测试作品</a>",
                "https://public.example/detail", "<b class='channel'>线路一</b><div class='list'><a href='/play/1'>第01集</a><a href='/play/2'>第02集</a></div>",
                "https://public.example/play/1", "<script>const player={url:'https:\\/\\/cdn.example\\/1.m3u8?token=a'};</script>",
                "https://public.example/play/2", "<iframe src='https://parser.example/page'></iframe>"), reads);
        String c = config("a", "index-grouped", ".hit");
        var hits = svc.search(c, "测试", 10);
        assertEquals("https://public.example/detail", hits.getFirst().sourceUrl());
        var preview = svc.preview(c, hits.getFirst().sourceUrl(), "测试作品");
        assertEquals(2, preview.episodes().size());
        assertEquals(2, preview.episodes().get(1).episodeNo());
        assertEquals("", preview.episodes().getFirst().playbackUrl());
        assertEquals("线路一", preview.episodes().getFirst().sourceLabel());
        var playback = svc.resolve(c, preview.episodes().getFirst().sourcePageUrl());
        assertEquals("https://cdn.example/1.m3u8?token=a", playback.url());
        assertEquals("application/vnd.apple.mpegurl", playback.mimeType());
        assertTrue(playback.warnings().stream().anyMatch(w -> w.contains("Referer")));
        assertThrows(BusinessException.class, () -> svc.resolve(c, "https://public.example/play/2"));
        assertFalse(reads.contains("https://parser.example/page"));
    }
    @Test
    void indexedAndNoChannelUseSeparateLinksAndDoNotReuseOtherConfiguration() throws Exception {
        var svc = service(Map.of("https://public.example/search?q=word", "<span class='name'>作品</span><a class='link' href='/detail'></a><a class='other' href='/different'>另一个作品</a>",
                "https://public.example/detail", "<a class='episode' href='/play'>第03集</a>"), new ArrayList<>());
        String c = config("indexed", "no-channel", ".unused");
        assertEquals("作品", svc.search(c, "word", 1).getFirst().title());
        assertEquals(3, svc.preview(c, "https://public.example/detail", "作品").episodes().getFirst().episodeNo());
        assertEquals("另一个作品", svc.search(config("a", "no-channel", ".other"), "word", 1).getFirst().title());
        assertEquals("https://public.example/different", svc.search(config("a", "no-channel", ".other"), "word", 1).getFirst().sourceUrl());
    }
    @Test
    void rssResourcesAreNotOnlinePlayback() throws Exception {
        String c = "{\"exportedMediaSourceDataList\":{\"mediaSources\":[{\"factoryId\":\"rss\",\"version\":1,\"arguments\":{\"name\":\"BT\",\"searchConfig\":{\"searchUrl\":\"https://public.example/feed?q={keyword}\"}}}]}}";
        var svc = service(Map.of("https://public.example/feed?q=word", "<rss><channel><item><title>资源</title><link>https://public.example/detail</link><enclosure url='https://public.example/a.torrent'/></item></channel></rss>"), new ArrayList<>());
        var hit = svc.search(c, "word", 5).getFirst();
        assertEquals("resource", hit.type());
        assertEquals("https://public.example/a.torrent", hit.sourceUrl());
        assertThrows(BusinessException.class, () -> svc.preview(c, hit.sourceUrl(), hit.title()));
        assertThrows(BusinessException.class, () -> svc.resolve(c, hit.sourceUrl()));
    }
    @Test
    void noSelectedWebRuleSearchesOnlyRssResources() throws Exception {
        var web = mapper.readTree(config("a", "no-channel", ".hit"))
            .path("exportedMediaSourceDataList").path("mediaSources").get(0);
        var rss = mapper.readTree("{\"factoryId\":\"rss\",\"version\":1,\"arguments\":{\"name\":\"BT\",\"searchConfig\":{\"searchUrl\":\"https://public.example/feed?q={keyword}\"}}}");
        var root = mapper.createObjectNode();
        var sources = root.putObject("exportedMediaSourceDataList").putArray("mediaSources");
        sources.add(web); sources.add(rss);
        var reads = new ArrayList<String>();
        var svc = service(Map.of("https://public.example/feed?q=word",
            "<rss><channel><item><title>资源</title><link>https://public.example/a.torrent</link></item></channel></rss>"), reads);
        var hits = svc.search(mapper.writeValueAsString(root), "word", 10, -1);
        assertEquals(1, hits.size());
        assertEquals("resource", hits.getFirst().type());
        assertEquals(List.of("https://public.example/feed?q=word"), reads);
    }
    @Test
    void rejectsForeignOriginsUnsupportedRulesInvalidJsonAndPrivateMedia() throws Exception {
        var reads = new ArrayList<String>();
        var svc = new SubscriptionPlaybackService(mapper, url -> { reads.add(url); return "<video src='https://127.0.0.1/a.mp4'></video>"; },
                url -> SubscriptionFetchPolicy.resolvePublic(URI.create(url), host -> new InetAddress[]{InetAddress.getByName(host)}));
        String c = config("a", "no-channel", ".hit");
        for (String url : List.of("http://public.example/detail", "https://private.example/detail", "https://public.example:444/detail", "https://localhost/detail"))
            assertThrows(BusinessException.class, () -> svc.preview(c, url, null));
        assertTrue(reads.isEmpty());
        assertThrows(BusinessException.class, () -> svc.resolve(c, "https://public.example/play"));
        assertThrows(BusinessException.class, () -> svc.search(c + " {}", "word", 1));
        assertThrows(BusinessException.class, () -> svc.search(config("javascript", "no-channel", ".hit"), "word", 1));
        assertThrows(BusinessException.class, () -> svc.search(c, " ", 1));
    }
}
