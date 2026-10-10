package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

/** HTTP 页面读取器测试：使用本地临时 HTTP 服务验证响应状态和大小边界。 */
class HttpMediaPageFetcherTest {

    private HttpServer server;

    @Test
    void limitsResponseBytesAndCancelsSlowBodies() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/large", exchange -> {
            byte[] bytes = new byte[2049];
            exchange.sendResponseHeaders(200, bytes.length);
            try { exchange.getResponseBody().write(bytes); } finally { exchange.close(); }
        });
        server.createContext("/slow", exchange -> {
            exchange.sendResponseHeaders(200, 100);
            try {
                exchange.getResponseBody().write(1);
                exchange.getResponseBody().flush();
                Thread.sleep(2500);
            } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        server.start();
        var fetcher = new HttpMediaPageFetcher(1000, 1024);
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        try {
            assertThrows(BusinessException.class, () -> fetcher.fetch(java.net.URI.create(base + "/large")));
            org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(java.time.Duration.ofSeconds(2),
                    () -> assertThrows(BusinessException.class, () -> fetcher.fetch(java.net.URI.create(base + "/slow"))));
        } finally { fetcher.close(); }
    }

    @Test
    void followsSameOriginRedirectAndRejectsForeignOriginAndLoops() throws Exception {
        var location = new java.util.concurrent.atomic.AtomicReference<>("/page");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/redirect", exchange -> {
            exchange.getResponseHeaders().set("Location", location.get());
            exchange.sendResponseHeaders(301, -1);
            exchange.close();
        });
        server.createContext("/page", exchange -> {
            byte[] body = "<html>playback</html>".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/redirect");
        var fetcher = new HttpMediaPageFetcher(3000, 2048);
        assertEquals("<html>playback</html>", fetcher.fetch(uri));
        location.set("http://localhost:1/private");
        assertThrows(BusinessException.class, () -> fetcher.fetch(uri));
        location.set("/redirect");
        assertThrows(BusinessException.class, () -> fetcher.fetch(uri));
    }

    @Test
    void canonicalRedirectDoesNotAllowOtherHostsPortsCredentialsOrDowngrades() {
        var source = java.net.URI.create("https://yhdmtv.cc/p/123/153/0");
        assertTrue(HttpMediaPageFetcher.allowedRedirect(source, java.net.URI.create("https://www.yhdmtv.cc/p/123/153/0")));
        for (String target : new String[] { "http://www.yhdmtv.cc/p/123", "https://www.yhdmtv.cc:8443/p/123",
                "https://www.yhdmtv.cc.evil.example/p/123", "https://user@www.yhdmtv.cc/p/123", "https://127.0.0.1/private" }) {
            assertFalse(HttpMediaPageFetcher.allowedRedirect(source, java.net.URI.create(target)), target);
        }
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    @Test
    void nonSuccessResponseBecomesServiceUnavailable() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/page", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        HttpMediaPageFetcher fetcher = new HttpMediaPageFetcher(3000, 2048);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> fetcher.fetch(java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/page")));

        assertEquals(5002, ex.errorCode().code());
    }

    @Test
    void successfulResponseReturnsHtml() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/page", exchange -> {
            byte[] body = "<html>ok</html>".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        HttpMediaPageFetcher fetcher = new HttpMediaPageFetcher(3000, 2048);

        String result = fetcher.fetch(java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/page"));

        assertEquals("<html>ok</html>", result);
    }
}
