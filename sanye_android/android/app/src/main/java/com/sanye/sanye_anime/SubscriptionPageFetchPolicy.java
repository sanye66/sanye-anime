package com.sanye.sanye_anime;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** 网页与订阅 JSON 分开读取：网页允许逐跳校验的 HTTPS 跳转和声明的字符集。 */
final class SubscriptionPageFetchPolicy {
    private static final java.util.concurrent.ExecutorService DNS = new java.util.concurrent.ThreadPoolExecutor(4, 4, 30,
            java.util.concurrent.TimeUnit.SECONDS, new java.util.concurrent.ArrayBlockingQueue<>(12), runnable -> {
                Thread thread = new Thread(runnable, "sanye-page-dns"); thread.setDaemon(true); return thread;
            });
    private static final OkHttpClient PAGE_CLIENT = createClient();
    private static OkHttpClient createClient() {
        // 网页搜索最多四路并发，不能争用图片层只有两路的 DNS 槽位。
        OkHttpClient client = CoverFetchPolicy.client().newBuilder().retryOnConnectionFailure(true).dns(host -> {
            java.util.concurrent.Future<java.net.InetAddress[]> lookup = null;
            try {
                java.net.URI target = SubscriptionFetchPolicy.validateUrl("https://" + host + "/");
                lookup = DNS.submit(() -> SubscriptionFetchPolicy.resolvePublic(target, java.net.InetAddress::getAllByName));
                return java.util.Arrays.asList(lookup.get(3, java.util.concurrent.TimeUnit.SECONDS));
            } catch (Exception failure) {
                java.net.UnknownHostException invalid = new java.net.UnknownHostException("来源域名不可用"); invalid.initCause(failure); throw invalid;
            } finally { if (lookup != null) lookup.cancel(true); }
        }).build();
        return client;
    }
    static String fetch(String url) throws Exception { return fetch(url, PAGE_CLIENT); }

    static String fetch(String url, OkHttpClient client) throws Exception {
        SubscriptionFetchPolicy.validateUrl(url);
        okhttp3.Call call = client.newCall(new Request.Builder().url(url)
                .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")
                .build());
        Thread owner = Thread.currentThread();
        java.util.concurrent.ScheduledExecutorService cancellation = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "sanye-page-cancel"); thread.setDaemon(true); return thread;
        });
        var watcher = cancellation.scheduleWithFixedDelay(() -> { if (owner.isInterrupted()) call.cancel(); }, 0, 25, java.util.concurrent.TimeUnit.MILLISECONDS);
        try (Response response = call.execute()) {
            if (!response.isSuccessful() || response.body() == null) throw new IOException("来源网页未返回成功响应");
            if (response.body().contentLength() > SubscriptionFetchPolicy.MAX_BYTES) throw new IOException("来源网页超过 2 MB");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (var input = response.body().byteStream()) {
                byte[] buffer = new byte[8192];
                for (int count; (count = input.read(buffer)) != -1;) {
                    if (count > SubscriptionFetchPolicy.MAX_BYTES - bytes.size()) throw new IOException("来源网页超过 2 MB");
                    bytes.write(buffer, 0, count);
                }
            }
            Charset charset = response.body().contentType() == null ? StandardCharsets.UTF_8 : response.body().contentType().charset(StandardCharsets.UTF_8);
            return new String(bytes.toByteArray(), charset);
        } finally {
            watcher.cancel(false); cancellation.shutdownNow();
        }
    }
}
