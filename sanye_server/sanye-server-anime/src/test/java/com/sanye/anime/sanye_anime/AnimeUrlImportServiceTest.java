package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.media.MediaImportService;
import com.sanye.anime.sanye_anime.media.MediaPageFetcher;
import com.sanye.anime.sanye_anime.cache.NoopHomeCache;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeMediaStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** URL 一键导入单测：使用固定 HTML，不访问外部站点。 */
class AnimeUrlImportServiceTest {

    private final InMemoryAnimeCatalogStore catalogStore = new InMemoryAnimeCatalogStore();
    private final InMemoryAnimeMediaStore mediaStore = new InMemoryAnimeMediaStore();
    private FakePageFetcher fetcher;
    private AnimeUrlImportService service;

    @BeforeEach
    void setUp() {
        AnimeMemoryStore.resetForTest();
        fetcher = new FakePageFetcher();
        AnimeManageService manageService = new AnimeManageService(catalogStore);
        MediaImportService mediaImportService = new MediaImportService(catalogStore, mediaStore, fetcher, "example.com", 5);
        HomeAggregationService homeAggregationService = new HomeAggregationService(
                new NoopHomeCache(), new ObjectMapper(), new HomeMetrics(new SimpleMeterRegistry()), 300, 30);
        service = new AnimeUrlImportService(manageService, mediaImportService, fetcher, homeAggregationService);
    }

    @Test
    void importsAnimeMetadataCoverAndEpisodesFromUrl() {
        fetcher.pages.put("https://example.com/p/900/",
                "<html><head><meta name='keywords' content='奇幻,冒险'>"
                        + "<meta property='og:image' content='/covers/imported.jpg'></head><body>"
                        + "<h1 class='article-title'>测试作品在线观看</h1>"
                        + "<div class='video_info'><strong>类型:</strong>日韩动漫<br><strong>首播:</strong>2024-01-01</div>"
                        + "<p class='jianjie'><span>剧情：一段公开简介。</span></p>"
                        + "<a href='/v/900-1-1/'>第1集</a><a href='/v/900-1-2/'>第2集</a></body></html>");
        fetcher.pages.put("https://example.com/v/900-1-1/",
                "<html><head><title>测试作品 第1集 | 日本动漫大全</title></head><body>"
                        + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/one.m3u8'};</script></body></html>");
        fetcher.pages.put("https://example.com/v/900-1-2/",
                "<html><head><title>测试作品 第2集</title></head><body>"
                        + "<script>var player_aaaa={\"url\":\"https:\\/\\/media.example\\/two.m3u8\"};</script></body></html>");

        var result = service.importFrom("https://example.com/p/900/", true);

        assertEquals("测试作品", result.anime().title());
        assertEquals("一段公开简介。", result.anime().summary());
        assertEquals("https://example.com/covers/imported.jpg", result.anime().coverUrl());
        assertEquals(2024, result.anime().year());
        assertEquals("已发布", result.anime().status());
        assertEquals(2, result.episodesImported());
        assertEquals("https://media.example/one.m3u8", mediaStore.episodesOf(result.anime().id()).get(0).playbackUrl());
    }

    @Test
    void repeatedImportUpdatesExistingTitleInsteadOfCreatingDuplicate() {
        fetcher.pages.put("https://example.com/p/901/",
                "<html><head><title>重复作品 - 樱花动漫</title></head><body>"
                        + "<p class='jianjie'>第一次简介。</p></body></html>");
        var first = service.importFrom("https://example.com/p/901/", false);
        fetcher.pages.put("https://example.com/p/901/",
                "<html><head><title>重复作品 - 樱花动漫</title></head><body>"
                        + "<p class='jianjie'>第二次简介。</p></body></html>");

        var second = service.importFrom("https://example.com/p/901/", false);

        assertEquals(first.anime().id(), second.anime().id());
        assertEquals("第二次简介。", second.anime().summary());
    }

    @Test
    void importsMetadataFromSameWorkDetailPageForPlaybackUrl() {
        fetcher.pages.put("https://example.com/p/902/153/0",
                "<html><body><script>var player_aaaa={url:'https:\\/\\/media.example\\/one.m3u8'};</script></body></html>");
        fetcher.pages.put("https://example.com/v/902/153",
                "<html><head><meta name='description' content='详情简介。'>"
                        + "<title>日韩动漫《详情作品》-樱花动漫</title></head><body>"
                        + "<h1 id='title_name'><div title='详情作品'>详情作品</div></h1>"
                        + "<img data-original='https://img.example/cover.jpg' alt='详情作品'></body></html>");

        var result = service.importFrom("https://example.com/p/902/153/0", true);

        assertEquals("详情作品", result.anime().title());
        assertEquals("https://img.example/cover.jpg", result.anime().coverUrl());
        assertEquals(1, result.episodesImported());
    }

    @Test
    void importsCleanTitleFromCurrentDetailTemplate() {
        fetcher.pages.put("https://example.com/v/903/153",
                "<html><head><title>电影综合《天气之子》-高清全集在线观看/手机免费番剧-樱花动漫</title>"
                        + "<meta name='description' content='公开简介。'></head><body>"
                        + "<div class='module-info-heading'><h1>天气之子</h1></div>"
                        + "<img src='/data/uploadFile/logo.png' alt='樱花动漫'>"
                        + "<div class='module-item-cover'><img data-original='https://img.example/weather.jpg' alt='天气之子'></div>"
                        + "</body></html>");
        fetcher.pages.put("https://example.com/p/903/153/0",
                "<html><body><script>var player_aaaa={url:'https:\\/\\/media.example\\/weather.m3u8'};</script></body></html>");

        var result = service.importFrom("https://example.com/p/903/153/0", true);

        assertEquals("天气之子", result.anime().title());
        assertEquals("剧场版", result.anime().type());
        assertEquals("https://img.example/weather.jpg", result.anime().coverUrl());
        assertEquals(1, result.episodesImported());
    }

    @Test
    void prefersPlaybackPageCurrentImageOverRelatedPoster() {
        fetcher.pages.put("https://example.com/p/904/153/0",
                "<html><head><title>正在播放《当前作品》</title></head><body>"
                        + "<div class='module-info-heading'><h1><div title='当前作品'>当前作品</div></h1></div>"
                        + "<div class='module-item-cover'><img data-original='https://img.example/related.jpg' alt='相关推荐'></div>"
                        + "<script>setVisitLocation({'name':'当前作品','imgUrl':'https:\\/\\/img.example\\/current.jpg'});</script>"
                        + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/current.m3u8'};</script></body></html>");

        var result = service.importFrom("https://example.com/p/904/153/0", true);

        assertEquals("当前作品", result.anime().title());
        assertEquals("https://img.example/current.jpg", result.anime().coverUrl());
        assertEquals(1, result.episodesImported());
    }

    @Test
    void previewsExternalUrlWithoutWritingCatalog() {
        fetcher.pages.put("https://example.com/p/905/153/0",
                "<html><head><title>日韩动漫《预览作品》-樱花动漫</title>"
                        + "<meta name='description' content='预览简介。'>"
                        + "<meta property='og:image' content='https://img.example/preview.jpg'></head><body>"
                        + "<h1 class='module-info-heading'><span>预览作品</span></h1>"
                        + "<script>var player_aaaa={url:'https:\\/\\/media.example\\/preview.m3u8'};</script>"
                        + "</body></html>");

        var result = service.previewFrom("https://example.com/p/905/153/0");

        assertEquals("预览作品", result.title());
        assertEquals("预览简介。", result.summary());
        assertEquals("https://img.example/preview.jpg", result.coverUrl());
        assertEquals(1, result.episodes().size());
        assertEquals("https://media.example/preview.m3u8", result.episodes().get(0).playbackUrl());
        assertTrue(catalogStore.allCards().stream().noneMatch(card -> card.title().equals("预览作品")));
    }

    @Test
    void rejectsNonHttpsUrl() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.importFrom("http://example.com/p/900/", false));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    private static final class FakePageFetcher implements MediaPageFetcher {
        private final Map<String, String> pages = new LinkedHashMap<>();

        @Override
        public String fetch(URI uri) {
            return pages.getOrDefault(uri.toString(), "<html></html>");
        }
    }
}
