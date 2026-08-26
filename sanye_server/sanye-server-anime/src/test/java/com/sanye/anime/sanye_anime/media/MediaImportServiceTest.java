package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeMediaStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 媒体导入服务单测：只验证页面元数据解析，不访问真实第三方站点。 */
class MediaImportServiceTest {

    private final InMemoryAnimeCatalogStore catalogStore = new InMemoryAnimeCatalogStore();
    private final InMemoryAnimeMediaStore mediaStore = new InMemoryAnimeMediaStore();
    private FakePageFetcher fetcher;
    private MediaImportService service;

    @BeforeEach
    void setUp() {
        com.sanye.anime.sanye_anime.AnimeMemoryStore.resetForTest();
        fetcher = new FakePageFetcher();
        service = new MediaImportService(catalogStore, mediaStore, fetcher, "example.com", 3);
    }

    @Test
    void importsSameHostEpisodesAndVisibleIframe() {
        fetcher.pages.put("https://example.com/p/65395/153/0", page("首页", "/p/65395/153/2", "/p/65395/153/3"));
        fetcher.pages.put("https://example.com/p/65395/153/2", page("第二集", "/p/65395/153/3"));
        fetcher.pages.put("https://example.com/p/65395/153/3", "<html><head><title>第三集</title></head>"
                + "<body><iframe src='https://player.example/video/3'></iframe></body></html>");

        var imported = service.importFrom(1, "https://example.com/p/65395/153/0");

        assertEquals(3, imported.size());
        assertEquals("首页", imported.get(0).title());
        assertEquals("https://player.example/video/3", imported.get(2).playbackUrl());
        assertEquals(3, mediaStore.episodesOf(1).size());
        assertEquals(3, fetcher.requested.size());
    }

    @Test
    void rejectsNonHttpsAndNonWhitelistedHost() {
        assertThrows(BusinessException.class, () -> service.importFrom(1, "http://example.com/p/1/1/1"));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.importFrom(1, "https://other.example/p/1/1/1"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void publicEpisodesHideUnpublishedAnime() {
        catalogStore.updateStatus(1, "已下架");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.listPublicEpisodes(1));
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode());
    }

    @Test
    void pageWithoutIframeProducesEmptyResultAndReplacesOldSnapshot() {
        mediaStore.replaceEpisodes(1, java.util.List.of(
                new AnimeEpisode(1, 1, "旧集", "https://example.com/old", "https://player.example/old", "text/html", "测试")));
        fetcher.pages.put("https://example.com/p/65395/153/0", "<html><head><title>无播放器</title></head><body></body></html>");

        var imported = service.importFrom(1, "https://example.com/p/65395/153/0");

        assertTrue(imported.isEmpty());
        assertTrue(mediaStore.episodesOf(1).isEmpty());
    }

    @Test
    void importsPublicVPagesAndHlsPlayerConfig() {
        fetcher.pages.put("https://example.com/p/69808/",
                "<html><body><a href='/v/69808-1-1/'>第1集</a><a href='/v/69808-1-2/'>第2集</a></body></html>");
        fetcher.pages.put("https://example.com/v/69808-1-1/",
                "<html><head><title>无职转生 第1集 | 日本动漫大全</title></head><body>"
                        + "<script>var player_aaaa={\"url\":\"https:\\/\\/media.example\\/one.m3u8\"};</script></body></html>");
        fetcher.pages.put("https://example.com/v/69808-1-2/",
                "<html><head><title>无职转生 第2集 | 日本动漫大全</title></head><body>"
                        + "<script>var player_aaaa={\"url\":\"https:\\/\\/media.example\\/two.m3u8\"};</script></body></html>");

        var imported = service.importFrom(1, "https://example.com/p/69808/");

        assertEquals(2, imported.size());
        assertEquals("无职转生 第1集", imported.get(0).title());
        assertEquals("https://media.example/one.m3u8", imported.get(0).playbackUrl());
        assertEquals("application/vnd.apple.mpegurl", imported.get(0).mimeType());
        assertEquals("公开 HLS 播放源", imported.get(1).sourceLabel());
    }

    @Test
    void reusesCurrentStructuredEpisodePageInsteadOfFetchingItTwice() {
        fetcher.pages.put("https://example.com/p/69808/153/0", "<html><body>"
                + "<div class='module-play-list'>"
                + "<a href='/p/69808/153/0' title='第01集'>第01集</a>"
                + "<a href='/p/69808/153/1' title='第02集'>第02集</a>"
                + "</div>"
                + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/one.m3u8'};</script>"
                + "</body></html>");
        fetcher.pages.put("https://example.com/p/69808/153/1", "<html><body>"
                + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/two.m3u8'};</script>"
                + "</body></html>");

        var imported = service.importFrom(1, "https://example.com/p/69808/153/0");

        assertEquals(2, imported.size());
        assertEquals(2, fetcher.requested.size());
        assertEquals(1, fetcher.requested.stream()
                .filter(url -> url.equals("https://example.com/p/69808/153/0"))
                .count());
    }

    @Test
    void importsHlsPlayerConfigWithoutTrailingSemicolon() {
        fetcher.pages.put("https://example.com/p/69808/",
                "<html><body><a href='/v/69808-1-1/'>第1集</a></body></html>");
        fetcher.pages.put("https://example.com/v/69808-1-1/",
                "<html><head><title>无职转生 第1集</title></head><body>"
                        + "<script>var player_aaaa = {\"url\":\"https:\\/\\/media.example\\/one.m3u8\"}</script>"
                        + "</body></html>");

        var imported = service.importFrom(1, "https://example.com/p/69808/");

        assertEquals(1, imported.size());
        assertEquals("https://media.example/one.m3u8", imported.get(0).playbackUrl());
        assertEquals("application/vnd.apple.mpegurl", imported.get(0).mimeType());
    }

    @Test
    void importsTemLineListEncodedHlsConfig() {
        fetcher.pages.put("https://example.com/p/69808/153/0", "<html><body>"
                + "<script>var temLineList = [{\"BarrageConfig\":{\"NeedLogin\":0},\"LineList\":[],\"file\":\"abcaHR0cHMlM0ElMkYlMkZtZWRpYS5leGFtcGxlJTJGb25lLm0zdTg=\"}];</script>"
                + "</body></html>");

        var imported = service.importFrom(1, "https://example.com/p/69808/153/0");

        assertEquals(1, imported.size());
        assertEquals("https://media.example/one.m3u8", imported.get(0).playbackUrl());
    }

    @Test
    void keepsAllTemLineListSourcesWithCurrentLineFirst() {
        fetcher.pages.put("https://example.com/p/69808/153/11", temLinePage(
                "[{\"LineList\":[],\"id\":12,\"name\":\"备用线路\",\"file\":\"abc"
                        + encodedUrl("https://media.example/backup.m3u8") + "\"},{\"LineList\":[],\"id\":11,\"name\":\"当前线路\",\"file\":\"abc"
                        + encodedUrl("https://media.example/current.m3u8") + "\"}]"));

        var imported = service.importFrom(1, "https://example.com/p/69808/153/11");

        assertEquals(1, imported.size());
        assertEquals("https://media.example/current.m3u8", imported.get(0).playbackUrl());
        assertEquals(2, imported.get(0).playbackOptions().size());
        assertEquals("https://media.example/backup.m3u8", imported.get(0).playbackOptions().get(1).url());
    }

    @Test
    void doesNotExposeAdjacentEpisodesAsPlaybackOptions() {
        fetcher.pages.put("https://example.com/p/69808/153/11", temLinePage(
                "[{\"LineList\":[],\"id\":11,\"name\":\"第01集\",\"file\":\"abc"
                        + encodedUrl("https://media.example/one.m3u8") + "\"},{\"LineList\":[],\"id\":10,\"name\":\"第02集\",\"file\":\"abc"
                        + encodedUrl("https://media.example/two.m3u8") + "\"}]"));

        var imported = service.importFrom(1, "https://example.com/p/69808/153/11");

        assertEquals(1, imported.size());
        assertEquals("https://media.example/one.m3u8", imported.get(0).playbackUrl());
        assertEquals(1, imported.get(0).playbackOptions().size());
    }

    @Test
    void importsHlsPlayerConfigFromLooseJavascriptObject() {
        fetcher.pages.put("https://example.com/p/69808/",
                "<html><body><a href='/v/69808-1-1/'>第1集</a></body></html>");
        fetcher.pages.put("https://example.com/v/69808-1-1/",
                "<html><head><title>无职转生 第1集</title></head><body>"
                        + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/loose.m3u8',from:'line1'};</script>"
                        + "<iframe src='https://player.example/embed'></iframe>"
                        + "</body></html>");

        var imported = service.importFrom(1, "https://example.com/p/69808/");

        assertEquals(1, imported.size());
        assertEquals("https://media.example/loose.m3u8", imported.get(0).playbackUrl());
        assertEquals("application/vnd.apple.mpegurl", imported.get(0).mimeType());
    }

    @Test
    void selectsExplicitEpisodePlaylistAndMatchingLine() {
        fetcher.pages.put("https://example.com/v/903/153", "<html><body>"
                + "<div class='module-play-list'><a href='/p/903/153/line-cn' title='HD国语'>国语</a></div>"
                + "<div class='module-play-list'><a href='/p/903/153/11' title='第01集'>第01集</a>"
                + "<a href='/p/903/153/10' title='第02集'>第02集</a></div></body></html>");
        fetcher.pages.put("https://example.com/p/903/153/11", temLinePage(
                "[{\"LineList\":[],\"id\":11,\"name\":\"第01集\",\"file\":\"abc" + encodedUrl("https://media.example/one.m3u8") + "\"}]"));
        fetcher.pages.put("https://example.com/p/903/153/10", temLinePage(
                "[{\"LineList\":[],\"id\":10,\"name\":\"第02集\",\"file\":\"abc" + encodedUrl("https://media.example/two.m3u8") + "\"}]"));

        var imported = service.importFrom(1, "https://example.com/v/903/153");

        assertEquals(2, imported.size());
        assertEquals("第01集", imported.get(0).title());
        assertEquals("https://media.example/one.m3u8", imported.get(0).playbackUrl());
        assertEquals("https://media.example/two.m3u8", imported.get(1).playbackUrl());
    }

    private String temLinePage(String lines) {
        return "<html><head><title>测试</title></head><body>"
                + "<script>var temLineList = " + lines + "; var temMemSysStatus = false;</script></body></html>";
    }

    private String encodedUrl(String url) {
        return java.util.Base64.getEncoder().encodeToString(
                java.net.URLEncoder.encode(url, java.nio.charset.StandardCharsets.UTF_8)
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private String page(String title, String... links) {
        String anchors = java.util.Arrays.stream(links)
                .map(link -> "<a href='" + link + "'>" + link + "</a>")
                .collect(java.util.stream.Collectors.joining());
        return "<html><head><title>" + title + "</title></head><body>"
                + "<iframe src='https://player.example/video/1'></iframe>" + anchors + "</body></html>";
    }

    /** 用内存页面替换网络访问，避免单测访问外站和产生副作用。 */
    private static final class FakePageFetcher implements MediaPageFetcher {
        private final Map<String, String> pages = new java.util.LinkedHashMap<>();
        private final java.util.List<String> requested = java.util.Collections.synchronizedList(new java.util.ArrayList<>());

        @Override
        public String fetch(URI uri) {
            requested.add(uri.toString());
            return pages.getOrDefault(uri.toString(), "<html></html>");
        }
    }
}
