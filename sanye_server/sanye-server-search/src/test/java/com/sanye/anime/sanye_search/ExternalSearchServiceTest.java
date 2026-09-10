package com.sanye.anime.sanye_search;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExternalSearchServiceTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    @Test
    void parsesDetailCandidatesAndSkipsPlayerLinks() {
        ExternalSearchService service = new ExternalSearchService(
                "https://yhdmtv.cc/search/index.html?keyword=",
                "https://yhdmtv.cc/public/auto/search1.html?keyword=",
                2097152);
        String html = "<div class='item'><a href='/p/123/153/0' title='天气之子'><img src='/cover.jpg'></a>"
                + "<p>阳光少女与少年相遇。</p></div><a href='/v/123-1-1/'>播放</a>"
                + "<div><a href='/p/124/'>天气之子 国语</a></div>";

        var hits = service.parse(html, "https://yhdmtv.cc/search/index.html?keyword=x", 10);

        assertEquals(2, hits.size());
        assertEquals("天气之子", hits.get(0).title());
        assertEquals("https://yhdmtv.cc/p/123/153/0", hits.get(0).sourceUrl());
        assertEquals("https://yhdmtv.cc/cover.jpg", hits.get(0).coverUrl());
    }

    @Test
    void prefersCardTitleOverPlayLinkText() {
        ExternalSearchService service = new ExternalSearchService(
                "https://yhdmtv.cc/search/index.html?keyword=",
                "https://yhdmtv.cc/public/auto/search1.html?keyword=",
                2097152);
        String html = "<div class='module-card-item'><div class='module-card-item-title'><a>天气之子</a></div>"
                + "<img data-original='/cover.jpg'><div class='module-card-item-footer'><a href='/p/74487/153/0'>播放</a></div></div>";

        var hits = service.parse(html, "https://yhdmtv.cc/public/auto/search1.html?keyword=x", 10);

        assertEquals("天气之子", hits.get(0).title());
    }

    @Test
    void acceptsPastedSearchUrlAsKeywordInput() {
        ExternalSearchService service = new ExternalSearchService(
                "https://yhdmtv.cc/search/index.html?keyword=",
                "https://yhdmtv.cc/public/auto/search1.html?keyword=",
                2097152);

        String keyword = service.normalizeKeyword("https://yhdmtv.cc/search/index.html?keyword=%E5%A4%A9%E6%B0%94%E4%B9%8B%E5%AD%90");

        assertEquals("天气之子", keyword);
    }

    @Test
    void cachesAndMergesConcurrentExternalSearches() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/search", exchange -> {
            requests.incrementAndGet();
            byte[] body = "<a href='https://yhdmtv.cc/p/123/' title='天气之子'>天气之子</a>"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/search?keyword=";
        ExternalSearchService service = new ExternalSearchService(base, base, 2097152);
        var callers = Executors.newFixedThreadPool(8);
        try {
            var futures = java.util.stream.IntStream.range(0, 8)
                    .mapToObj(ignored -> callers.submit(() -> service.search("天气之子", 20)))
                    .toList();
            for (var future : futures) {
                assertEquals(1, future.get().size());
            }
            assertEquals(1, service.search("天气之子", 20).size());
        } finally {
            callers.shutdownNow();
        }
        assertEquals(1, requests.get());
    }

    @Test
    void expandsExactAliasAndKeepsOriginalKeywordMatches() throws Exception {
        ConcurrentLinkedQueue<String> requestedKeywords = new ConcurrentLinkedQueue<>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/search", exchange -> {
            String rawQuery = exchange.getRequestURI().getRawQuery();
            requestedKeywords.add(URLDecoder.decode(
                    rawQuery.substring(rawQuery.indexOf('=') + 1), StandardCharsets.UTF_8));
            String html = "<div><a href='https://yhdmtv.cc/p/1/153/0' title='战勇OVA：学园战勇，青春物语'>原词候选</a></div>"
                    + "<div><a href='https://yhdmtv.cc/p/2/153/0' title='我的青春恋爱物语果然有问题'>别名候选</a></div>";
            byte[] body = html.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/search?keyword=";
        ExternalSearchService service = new ExternalSearchService(base, base, 2097152);

        var preferred = service.searchPreferred("春物", null, 20);
        var hits = service.search("春物", 20);

        assertEquals(Set.of("我的青春恋爱物语果然有问题", "春物"), Set.copyOf(requestedKeywords));
        assertEquals(2, requestedKeywords.size());
        assertEquals(1, preferred.size());
        assertEquals("我的青春恋爱物语果然有问题", preferred.get(0).title());
        assertEquals(2, hits.size());
        assertEquals("我的青春恋爱物语果然有问题", hits.get(0).title());
        assertEquals("战勇OVA：学园战勇，青春物语", hits.get(1).title());
    }

    @Test
    void keepsOnlyKeywordTitlesAndReadsLazyCover() {
        ExternalSearchService service = service();
        String html = "<div class='module-card-item'>"
                + "<div class='module-card-item-class'>日韩动漫</div>"
                + "<div class='module-card-item-title'>天气之子</div>"
                + "<img data-lazy-src='/weather.jpg'><a href='/p/1/153/0'>播放</a></div>"
                + "<div class='module-card-item'><div class='module-card-item-title'>你的名字</div>"
                + "<a href='/p/2/153/0'>播放</a></div>";

        var hits = service.parse(html, "https://yhdmtv.cc/public/auto/search1.html?keyword=x",
                "天气之子", "", 10);

        assertEquals(1, hits.size());
        assertEquals("天气之子", hits.get(0).title());
        assertEquals("https://yhdmtv.cc/weather.jpg", hits.get(0).coverUrl());
        assertEquals("电视动画", hits.get(0).type());
    }

    @Test
    void replacesVerifiedUnavailableCoverWithSameWorkCover() {
        ExternalSearchService service = service();
        String html = "<div class='module-card-item'><div class='module-card-item-title'>"
                + "我的青春恋爱物语果然有问题</div>"
                + "<img data-original='https://img.lzzyimg.com/upload/vod/20220501-1/4ccbe000d359e7428dbe806ba68a052d.jpg'>"
                + "<a href='/p/301852/153/0'>播放</a></div>";

        var hits = service.parse(html, "https://yhdmtv.cc/public/auto/search1.html?keyword=x",
                "我的青春恋爱物语果然有问题", "", 10);

        assertEquals(1, hits.size());
        assertEquals("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/"
                + "bx14813-3mNvcKNEQcDs.jpg", hits.get(0).coverUrl());
    }

    @Test
    void deduplicatesTitleAndPrefersSpecificMovieClassification() {
        ExternalSearchService service = service();
        String html = "<div class='module-card-item'><div class='module-card-item-class'>日韩动漫</div>"
                + "<div class='module-card-item-title'>天气之子</div><img data-original='/first.jpg'>"
                + "<a href='/p/1/153/0'>播放</a></div>"
                + "<div class='module-card-item'><div class='module-card-item-class'>综合</div>"
                + "<div class='module-card-item-class'>电影</div><div class='module-card-item-title'>天气之子</div>"
                + "<img data-original='/second.jpg'><a href='/p/2/364/0'>播放</a></div>";

        var all = service.parse(html, "https://yhdmtv.cc/public/auto/search1.html?keyword=x",
                "天气之子", "", 10);
        var television = service.parse(html, "https://yhdmtv.cc/public/auto/search1.html?keyword=x",
                "天气之子", "电视动画", 10);

        assertEquals(1, all.size());
        assertEquals("剧场版", all.get(0).type());
        assertEquals("https://yhdmtv.cc/p/2/364/0", all.get(0).sourceUrl());
        assertEquals("https://yhdmtv.cc/first.jpg", all.get(0).coverUrl());
        assertTrue(television.isEmpty());
    }

    private ExternalSearchService service() {
        return new ExternalSearchService(
                "https://yhdmtv.cc/search/index.html?keyword=",
                "https://yhdmtv.cc/public/auto/search1.html?keyword=",
                2097152);
    }
}
