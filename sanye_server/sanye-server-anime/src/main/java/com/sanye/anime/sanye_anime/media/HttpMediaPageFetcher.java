package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.time.Duration;
import java.util.Objects;
import java.util.Set;

/** 使用多地址连接回退读取公开 HTML，限制超时与响应大小，不请求播放器流地址。 */
@Component
public class HttpMediaPageFetcher implements MediaPageFetcher {

    private static final ScheduledThreadPoolExecutor DEADLINES = new ScheduledThreadPoolExecutor(1, task -> {
        Thread thread = new Thread(task, "sanye-media-deadline");
        thread.setDaemon(true);
        return thread;
    });
    static { DEADLINES.setRemoveOnCancelPolicy(true); }
    private final CloseableHttpClient client;
    private final Duration timeout;
    private final int maxBytes;

    /** 注入导入超时和最大响应大小配置。 */
    public HttpMediaPageFetcher(
            @Value("${sanye.media.import.timeout-ms:30000}") int timeoutMs,
            @Value("${sanye.media.import.max-bytes:2097152}") int maxBytes) {
        this.timeout = Duration.ofMillis(Math.max(timeoutMs, 1000));
        this.maxBytes = Math.max(maxBytes, 1024);
        // 禁止自动跟随重定向，避免白名单页面把服务端请求带到未校验的内网地址。
        var manager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofMilliseconds(Math.min(this.timeout.toMillis(), 2000)))
                        .setSocketTimeout(Timeout.ofMilliseconds(Math.min(this.timeout.toMillis(), 3000))).build())
                .build();
        this.client = HttpClients.custom().setConnectionManager(manager)
                .disableRedirectHandling().disableAutomaticRetries().disableCookieManagement().build();
    }

    /** 发起只读 GET；响应状态、Content-Length 和最终字节数均受限。 */
    @Override
    public String fetch(URI uri) {
        try {
            long deadline = System.nanoTime() + timeout.toNanos();
            for (int redirects = 0; redirects <= 3; redirects++) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面读取超时");
                HttpGet request = new HttpGet(uri);
                request.setConfig(RequestConfig.custom().setResponseTimeout(Timeout.ofNanoseconds(remaining)).build());
                request.setHeader("Accept", "text/html,application/xhtml+xml");
                request.setHeader("User-Agent", "sanye_anime-media-metadata/1.0");
                var cancellation = DEADLINES.schedule(request::cancel, remaining, TimeUnit.NANOSECONDS);
                PageResponse response;
                try {
                    response = client.execute(request, incoming -> {
                        int status = incoming.getCode();
                        var location = incoming.getFirstHeader("Location");
                        if (status < 200 || status >= 300) {
                            // Do not wait for redirect/error bodies before validating the next address.
                            incoming.close();
                            return new PageResponse(status, location == null ? null : location.getValue(), "");
                        }
                        var entity = incoming.getEntity();
                        if (entity == null) return new PageResponse(status, null, "");
                        try (var stream = entity.getContent()) {
                            byte[] bytes = stream.readNBytes(maxBytes + 1);
                            if (bytes.length > maxBytes) throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面超过允许大小");
                            return new PageResponse(status, null, new String(bytes, StandardCharsets.UTF_8));
                        }
                    });
                } finally {
                    cancellation.cancel(false);
                }
                if (Set.of(301, 302, 303, 307, 308).contains(response.status())) {
                    if (response.location() == null) throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源跳转地址缺失");
                    URI next = uri.resolve(response.location());
                    if (!allowedRedirect(uri, next)) {
                        throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源跳转地址不在允许范围内");
                    }
                    uri = next;
                    continue;
                }
                if (response.status() < 200 || response.status() >= 300) {
                    throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面返回 HTTP " + response.status());
                }
                return response.body();
            }
            throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面跳转次数过多");
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面读取失败，请稍后重试");
        }
    }

    private record PageResponse(int status, String location, String body) { }

    @PreDestroy
    public void close() throws java.io.IOException {
        client.close();
    }

    static boolean allowedRedirect(URI from, URI to) {
        if (to.getUserInfo() != null || to.getHost() == null) return false;
        boolean sameOrigin = Objects.equals(from.getScheme(), to.getScheme())
                && Objects.equals(from.getHost(), to.getHost()) && from.getPort() == to.getPort();
        Set<String> hosts = Set.of("yhdmtv.cc", "www.yhdmtv.cc");
        boolean canonicalHost = "https".equalsIgnoreCase(from.getScheme())
                && "https".equalsIgnoreCase(to.getScheme())
                && hosts.contains(from.getHost()) && hosts.contains(to.getHost())
                && (from.getPort() == -1 || from.getPort() == 443)
                && (to.getPort() == -1 || to.getPort() == 443);
        return sameOrigin || canonicalHost;
    }
}
