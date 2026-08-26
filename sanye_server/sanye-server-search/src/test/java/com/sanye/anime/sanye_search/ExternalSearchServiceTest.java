package com.sanye.anime.sanye_search;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
