package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** HTTP 页面读取器测试：使用本地临时 HTTP 服务验证响应状态和大小边界。 */
class HttpMediaPageFetcherTest {

    private HttpServer server;

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
