package com.sanye.anime.sanye_search;

import com.sanye.anime.sanye_search.model.ExternalSearchHitView;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 外部搜索桥：按关键词读取授权站点搜索页，只返回详情页候选。 */
@Service
public class ExternalSearchService {

    private static final ExecutorService FETCH_EXECUTOR = Executors.newFixedThreadPool(8, runnable -> {
        Thread thread = new Thread(runnable, "sanye-external-search");
        thread.setDaemon(true);
        return thread;
    });

    private final HttpClient client;
    private final URI searchBase;
    private final URI resultsBase;
    private final int maxBytes;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<List<ExternalSearchHitView>>> inFlight = new ConcurrentHashMap<>();

    /** 外部站点结果只做短时缓存，降低重复搜索对远端和本服务的等待。 */
    @Value("${sanye.search.external-cache-ttl-ms:120000}")
    private long cacheTtlMs = 120_000L;

    @Value("${sanye.search.external-empty-cache-ttl-ms:10000}")
    private long emptyCacheTtlMs = 10_000L;

    /** 注入搜索页和动态结果页模板，默认匹配 yhdmtv.cc 的 keyword 查询格式。 */
    public ExternalSearchService(
            @Value("${sanye.search.external-base:https://yhdmtv.cc/search/index.html?keyword=}") String externalBase,
            @Value("${sanye.search.external-results-base:https://yhdmtv.cc/public/auto/search1.html?keyword=}") String externalResultsBase,
            @Value("${sanye.search.external-max-bytes:2097152}") int maxBytes) {
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
        this.searchBase = URI.create(externalBase);
        this.resultsBase = URI.create(externalResultsBase);
        this.maxBytes = Math.max(maxBytes, 1024);
    }

    /** 查询外部搜索页并提取 /p/ 详情候选，去重后按页面顺序返回。 */
    public List<ExternalSearchHitView> search(String keyword, int size) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        String safeKeyword = normalizeKeyword(keyword);
        if (safeKeyword.isBlank()) {
            return List.of();
        }
        if (safeKeyword.length() > 50) {
            safeKeyword = safeKeyword.substring(0, 50);
        }
        String queryKeyword = safeKeyword;
        String cacheKey = queryKeyword.toLowerCase(java.util.Locale.ROOT) + "\u0000" + Math.min(Math.max(size, 1), 30);
        long now = System.currentTimeMillis();
        CacheEntry cached = cache.get(cacheKey);
        if (cached != null && cached.expiresAt() > now) {
            return cached.results();
        }
        CompletableFuture<List<ExternalSearchHitView>> future = inFlight.computeIfAbsent(cacheKey,
                key -> CompletableFuture.supplyAsync(() -> {
                    URI url = URI.create(resultsBase.toString() + URLEncoder.encode(queryKeyword, StandardCharsets.UTF_8));
                    List<ExternalSearchHitView> result = List.copyOf(parse(fetch(url), url.toString(), size));
                    long ttl = result.isEmpty() ? emptyCacheTtlMs : cacheTtlMs;
                    cache.put(key, new CacheEntry(result, System.currentTimeMillis() + Math.max(ttl, 1000L)));
                    if (cache.size() > 256) {
                        cache.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= System.currentTimeMillis());
                        if (cache.size() > 256) {
                            cache.entrySet().stream()
                                    .min(java.util.Comparator.comparingLong(entry -> entry.getValue().expiresAt()))
                                    .ifPresent(entry -> cache.remove(entry.getKey(), entry.getValue()));
                        }
                    }
                    return result;
                }, FETCH_EXECUTOR));
        try {
            return future.join();
        } finally {
            inFlight.remove(cacheKey, future);
        }
    }

    /** 解析搜索页 HTML，供单测使用固定样本覆盖。 */
    List<ExternalSearchHitView> parse(String html, String pageUrl, int size) {
        Document document = Jsoup.parse(html, pageUrl);
        Map<String, ExternalSearchHitView> hits = new LinkedHashMap<>();
        int limit = Math.min(Math.max(size, 1), 30);
        for (Element link : document.select("a[href]")) {
            String href = link.absUrl("href");
            if (!isDetailUrl(href) || hits.containsKey(href)) {
                continue;
            }
            Element item = nearestItem(link);
            Element itemTitle = item.selectFirst("h1,h2,h3,.title,.vodname,.module-card-item-title");
            String title = firstNonBlank(link.attr("title"),
                    itemTitle == null ? "" : itemTitle.text(), link.text());
            if (title.isBlank()) {
                continue;
            }
            String cover = "";
            Element image = item.selectFirst("img[src],img[data-original]");
            if (image != null) {
                cover = image.hasAttr("data-original") ? image.attr("abs:data-original") : image.attr("abs:src");
            }
            String summary = item.text().replace(title, "").replaceAll("\\s+", " ").trim();
            hits.put(href, new ExternalSearchHitView(clean(title, 120), href, cover, clean(summary, 180)));
            if (hits.size() >= limit) {
                break;
            }
        }
        return new ArrayList<>(hits.values());
    }

    private String fetch(URI uri) {
        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(5))
                    .header("Accept", "text/html,application/xhtml+xml")
                    .header("User-Agent", "sanye_anime-external-search/1.0")
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return "";
            }
            String body = response.body() == null ? "" : response.body();
            return body.getBytes(StandardCharsets.UTF_8).length > maxBytes ? "" : body;
        } catch (Exception ex) {
            return "";
        }
    }

    private boolean isDetailUrl(String href) {
        try {
            URI uri = URI.create(href);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && isYhdmHost(uri.getHost())
                    && uri.getPath().matches("^/p/[^/]+(?:/[^/]+){0,3}/?$");
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    String normalizeKeyword(String keyword) {
        String value = keyword == null ? "" : keyword.trim();
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            return value;
        }
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || !isYhdmHost(uri.getHost())
                    || !"/search/index.html".equals(uri.getPath())
                    || uri.getRawQuery() == null) {
                return value;
            }
            for (String pair : uri.getRawQuery().split("&")) {
                int index = pair.indexOf('=');
                String key = index >= 0 ? pair.substring(0, index) : pair;
                if ("keyword".equals(URLDecoder.decode(key, StandardCharsets.UTF_8))) {
                    String raw = index >= 0 ? pair.substring(index + 1) : "";
                    return URLDecoder.decode(raw, StandardCharsets.UTF_8).trim();
                }
            }
            return "";
        } catch (IllegalArgumentException ex) {
            return value;
        }
    }

    private boolean isYhdmHost(String host) {
        return "yhdmtv.cc".equalsIgnoreCase(host) || "www.yhdmtv.cc".equalsIgnoreCase(host);
    }

    private Element nearestItem(Element link) {
        Element current = link;
        for (int index = 0; index < 4 && current.parent() != null; index++) {
            current = current.parent();
            if (current.selectFirst("img[src],img[data-original]") != null || current.text().length() > 20) {
                return current;
            }
        }
        return link;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String clean(String value, int max) {
        String text = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private record CacheEntry(List<ExternalSearchHitView> results, long expiresAt) {
    }
}
