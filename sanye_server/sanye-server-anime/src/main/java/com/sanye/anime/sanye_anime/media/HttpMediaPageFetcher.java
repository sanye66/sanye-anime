package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** 使用 JDK HttpClient 读取公开 HTML，限制超时与响应大小，不请求播放器流地址。 */
@Component
public class HttpMediaPageFetcher implements MediaPageFetcher {

    private final HttpClient client;
    private final Duration timeout;
    private final int maxBytes;

    /** 注入导入超时和最大响应大小配置。 */
    public HttpMediaPageFetcher(
            @Value("${sanye.media.import.timeout-ms:30000}") int timeoutMs,
            @Value("${sanye.media.import.max-bytes:2097152}") int maxBytes) {
        this.timeout = Duration.ofMillis(Math.max(timeoutMs, 1000));
        this.maxBytes = Math.max(maxBytes, 1024);
        // 禁止自动跟随重定向，避免白名单页面把服务端请求带到未校验的内网地址。
        this.client = HttpClient.newBuilder().connectTimeout(this.timeout).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    /** 发起只读 GET；响应状态、Content-Length 和最终字节数均受限。 */
    @Override
    public String fetch(URI uri) {
        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(timeout)
                    .header("Accept", "text/html,application/xhtml+xml")
                    .header("User-Agent", "sanye_anime-media-metadata/1.0")
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面返回 HTTP " + response.statusCode());
            }
            String body = response.body() == null ? "" : response.body();
            if (body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > maxBytes) {
                throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面超过允许大小");
            }
            return body;
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "来源页面读取失败，请稍后重试");
        }
    }
}
