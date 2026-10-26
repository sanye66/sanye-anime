package com.sanye.sanye_anime;
import org.junit.Test;
import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

public class SubscriptionFetchPolicyTest {
    @Test public void subscriptionRequestUsesJsonAcceptAndStableUserAgent() throws Exception {
        String source = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(
                "src/main/java/com/sanye/sanye_anime/SubscriptionFetchPolicy.java")), StandardCharsets.UTF_8);
        assertTrue(source.contains("Accept: application/json"));
        assertTrue(source.contains("User-Agent: sanye_anime/AndroidSource"));
    }

    @Test public void unreachableFirstAddressFallsBackWithinSharedDeadline() throws Exception {
        InetAddress first = InetAddress.getByName("2606:4700:4700::1111");
        InetAddress second = InetAddress.getByName("8.8.8.8");
        var attempted = new java.util.ArrayList<InetAddress>();
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(8);
        try (var connected = new java.net.Socket()) {
            assertSame(connected, SubscriptionFetchPolicy.connectPublic(new InetAddress[]{first, second}, deadline,
                    (address, timeout) -> {
                        attempted.add(address);
                        assertTrue(timeout > 0 && timeout <= 8000);
                        if (address.equals(first)) {
                            assertTrue(timeout <= 4000);
                            throw new java.net.SocketTimeoutException("IPv6 unavailable");
                        }
                        return connected;
                    }));
            assertEquals(java.util.List.of(first, second), attempted);
        }
    }

    @Test public void deadlineAndCancellationDoNotTryAnotherAddress() throws Exception {
        InetAddress[] addresses = {InetAddress.getByName("8.8.8.8"), InetAddress.getByName("1.1.1.1")};
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        assertThrows(IOException.class, () -> SubscriptionFetchPolicy.connectPublic(addresses, System.nanoTime() - 1,
                (address, timeout) -> { attempts.incrementAndGet(); return new java.net.Socket(); }));
        assertEquals(0, attempts.get());
        try {
            assertThrows(IOException.class, () -> SubscriptionFetchPolicy.connectPublic(addresses,
                    System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(8), (address, timeout) -> {
                        attempts.incrementAndGet(); Thread.currentThread().interrupt(); throw new IOException("cancelled");
                    }));
            assertEquals(1, attempts.get());
        } finally { Thread.interrupted(); }
    }

    @Test public void cancellingBlockedSocketClosesConnectionWithoutWaitingForReadTimeout() throws Exception {
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        var reading = new java.util.concurrent.CountDownLatch(1);
        var stopped = new java.util.concurrent.CountDownLatch(1);
        var failed = new java.util.concurrent.atomic.AtomicReference<Throwable>();
        try (var server = new java.net.ServerSocket(0, 1, InetAddress.getLoopbackAddress());
             var socket = new java.net.Socket(InetAddress.getLoopbackAddress(), server.getLocalPort());
             var peer = server.accept()) {
            socket.setSoTimeout(SubscriptionFetchPolicy.TIMEOUT_MILLIS);
            var request = pool.submit(() -> {
                var cancellation = SubscriptionFetchPolicy.closeOnInterrupt(socket, Thread.currentThread());
                try {
                    reading.countDown();
                    SubscriptionFetchPolicy.readResponse(socket.getInputStream(), () -> {});
                    failed.set(new AssertionError("无响应套接字不应读取成功"));
                } catch (IOException expected) {
                    if (!socket.isClosed()) failed.set(expected);
                } finally { cancellation.cancel(false); stopped.countDown(); }
            });
            assertTrue(reading.await(1, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse("真实网络读取应保持阻塞", stopped.await(50, java.util.concurrent.TimeUnit.MILLISECONDS));
            request.cancel(true);
            assertTrue("取消应关闭连接，不等 8 秒读超时", stopped.await(1, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(socket.isClosed()); assertNull(failed.get());
            assertEquals("对端应观察到关闭", -1, peer.getInputStream().read());
            assertEquals("工作线程已释放", "可用", pool.submit(() -> "可用").get(1, java.util.concurrent.TimeUnit.SECONDS));
        } finally { pool.shutdownNow(); }
    }

    @Test
    public void acceptsHttpsAndRejectsUnsafeUrls() throws Exception {
        assertEquals("sub.creamycake.org", SubscriptionFetchPolicy.validateUrl("https://sub.creamycake.org/v1/css1.json").getHost());
        for (String url : new String[]{"http://public.example/file", "https://user:pass@public.example/file",
                "https://public.example:444/file", "https://localhost/file", "https://a.local/file",
                "https://a.internal/file", "https://a.lan/file", "https://a.home/file",
                "https://public.example/file#fragment", "https://public.example/%0a"}) {
            // 编码路径可以安全原样发送；它不会成为请求头换行。
            if (url.endsWith("%0a")) continue;
            assertThrows(IOException.class, () -> SubscriptionFetchPolicy.validateUrl(url));
        }
    }

    @Test
    public void rejectsEveryNonPublicAnswerIncludingMixedDns() throws Exception {
        for (String ip : new String[]{"0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254",
                "172.31.1.1", "192.168.1.1", "100.64.1.1", "198.18.0.1", "192.0.2.1",
                "198.51.100.3", "203.0.113.1", "224.0.0.1", "240.0.0.1", "::", "::1",
                "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1",
                "2002:0808:0808::1", "64:ff9b::a00:1", "3fff::1"}) {
            assertFalse(ip, SubscriptionFetchPolicy.isPublic(InetAddress.getByName(ip)));
        }
        assertTrue(SubscriptionFetchPolicy.isPublic(InetAddress.getByName("8.8.8.8")));
        assertTrue(SubscriptionFetchPolicy.isPublic(InetAddress.getByName("2606:4700:4700::1111")));
        var uri = SubscriptionFetchPolicy.validateUrl("https://public.example/a.json");
        assertThrows(IOException.class, () -> SubscriptionFetchPolicy.resolvePublic(uri,
                host -> new InetAddress[]{InetAddress.getByName("8.8.8.8"), InetAddress.getByName("127.0.0.1")}));
        assertThrows(IOException.class, () -> SubscriptionFetchPolicy.resolvePublic(uri, host -> new InetAddress[0]));
    }

    @Test
    public void readsLengthChunkedAndEofWithoutExecutingContent() throws Exception {
        String body = "{\"script\":\"throw new Error('must not run')\"}";
        assertEquals(body, response("HTTP/1.1 200 OK\r\nContent-Length: " + body.length() + "\r\n\r\n" + body));
        assertEquals("{}", response("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n"));
        assertEquals("{}", response("HTTP/1.1 200 OK\r\n\r\n{}"));
    }

    @Test
    public void rejectsRedirectCompressionOversizeAndTruncation() {
        for (String wire : new String[]{
                "HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1/\r\n\r\n",
                "HTTP/1.1 503 Failed\r\n\r\n",
                "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n{}",
                "HTTP/1.1 200 OK\r\nContent-Length: 2097153\r\n\r\n",
                "HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\n{}",
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n{}",
                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n200001\r\n",
                "HTTP/1.1 200 OK\r\n\r\n" + "a".repeat(SubscriptionFetchPolicy.MAX_BYTES + 1)}) {
            assertThrows(IOException.class, () -> response(wire));
        }
    }

    @Test
    public void checksDeadlineDuringReadsAndRejectsMalformedUtf8() {
        assertThrows(IOException.class, () -> SubscriptionFetchPolicy.readResponse(
                new ByteArrayInputStream("HTTP/1.1 200 OK\r\n\r\n{}".getBytes(StandardCharsets.UTF_8)),
                () -> { throw new IOException("超时"); }));
        byte[] head = "HTTP/1.1 200 OK\r\n\r\n".getBytes(StandardCharsets.UTF_8);
        byte[] invalid = java.util.Arrays.copyOf(head, head.length + 1);
        invalid[head.length] = (byte) 0xff;
        assertThrows(IOException.class, () -> SubscriptionFetchPolicy.readResponse(
                new ByteArrayInputStream(invalid), () -> {}));
    }

    private static String response(String wire) throws IOException {
        return SubscriptionFetchPolicy.readResponse(new ByteArrayInputStream(wire.getBytes(StandardCharsets.UTF_8)), () -> {});
    }
}
