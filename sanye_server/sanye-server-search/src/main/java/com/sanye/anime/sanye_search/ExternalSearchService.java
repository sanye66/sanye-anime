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
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
        return search(keyword, null, size);
    }

    /** 查询外部搜索页，并按标准作品类型进行严格筛选。 */
    public List<ExternalSearchHitView> search(String keyword, String type, int size) {
        List<String> queryKeywords = queryKeywords(keyword);
        if (queryKeywords.isEmpty()) {
            return List.of();
        }
        String requestedType = type == null ? "" : type.trim();
        int limit = Math.min(Math.max(size, 1), 30);
        List<CompletableFuture<List<ExternalSearchHitView>>> searches = queryKeywords.stream()
                .map(queryKeyword -> searchOneAsync(queryKeyword, requestedType))
                .toList();
        CompletableFuture.allOf(searches.toArray(CompletableFuture[]::new)).join();
        Map<String, ExternalSearchHitView> merged = new LinkedHashMap<>();
        for (CompletableFuture<List<ExternalSearchHitView>> search : searches) {
            for (ExternalSearchHitView hit : search.join()) {
                merged.merge(normalizeForMatch(hit.title()), hit, this::preferCandidate);
            }
        }
        return merged.values().stream().limit(limit).toList();
    }

    /** 只读取别名的正式标题结果，供客户端先展示高相关候选。 */
    public List<ExternalSearchHitView> searchPreferred(String keyword, String type, int size) {
        List<String> queryKeywords = queryKeywords(keyword);
        if (queryKeywords.isEmpty()) {
            return List.of();
        }
        int limit = Math.min(Math.max(size, 1), 30);
        String requestedType = type == null ? "" : type.trim();
        return searchOneAsync(queryKeywords.get(0), requestedType).join().stream().limit(limit).toList();
    }

    private List<String> queryKeywords(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        return SearchKeywordAliases.expand(normalizeKeyword(keyword)).stream()
                .map(value -> value.length() > 50 ? value.substring(0, 50) : value)
                .toList();
    }

    /** 单个来源查询独立缓存并合并并发，优先查询与完整查询可以共享同一次抓取。 */
    private CompletableFuture<List<ExternalSearchHitView>> searchOneAsync(String queryKeyword, String requestedType) {
        String cacheKey = queryKeyword.toLowerCase(Locale.ROOT) + "\u0000" + requestedType;
        long now = System.currentTimeMillis();
        CacheEntry cached = cache.get(cacheKey);
        if (cached != null && cached.expiresAt() > now) {
            return CompletableFuture.completedFuture(cached.results());
        }
        CompletableFuture<List<ExternalSearchHitView>> future = inFlight.computeIfAbsent(cacheKey,
                key -> CompletableFuture.supplyAsync(() -> {
                    URI url = URI.create(resultsBase.toString()
                            + URLEncoder.encode(queryKeyword, StandardCharsets.UTF_8));
                    return List.copyOf(parse(fetch(url), url.toString(), queryKeyword, requestedType, 30));
                }, FETCH_EXECUTOR).thenApply(result -> {
                    long ttl = result.isEmpty() ? emptyCacheTtlMs : cacheTtlMs;
                    cache.put(key, new CacheEntry(result,
                            System.currentTimeMillis() + Math.max(ttl, 1000L)));
                    trimCache();
                    return result;
                }));
        future.whenComplete((ignored, error) -> inFlight.remove(cacheKey, future));
        return future;
    }

    private void trimCache() {
        if (cache.size() <= 256) {
            return;
        }
        cache.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= System.currentTimeMillis());
        if (cache.size() > 256) {
            cache.entrySet().stream()
                    .min(java.util.Comparator.comparingLong(entry -> entry.getValue().expiresAt()))
                    .ifPresent(entry -> cache.remove(entry.getKey(), entry.getValue()));
        }
    }

    /** 解析搜索页 HTML，供兼容调用和固定样本测试使用。 */
    List<ExternalSearchHitView> parse(String html, String pageUrl, int size) {
        return parse(html, pageUrl, "", "", size);
    }

    /** 仅保留标题匹配的结果卡片，并将来源分类映射为项目标准分类。 */
    List<ExternalSearchHitView> parse(String html, String pageUrl, String keyword, String type, int size) {
        Document document = Jsoup.parse(html, pageUrl);
        Map<String, ExternalSearchHitView> hits = new LinkedHashMap<>();
        int limit = Math.min(Math.max(size, 1), 30);
        for (Element link : document.select("a[href*='/p/']")) {
            String href = link.absUrl("href");
            if (!isDetailUrl(href)) {
                continue;
            }
            Element item = nearestItem(link);
            Element itemTitle = item.selectFirst("h1,h2,h3,.title,.vodname,.module-card-item-title");
            String title = firstNonBlank(link.attr("title"),
                    itemTitle == null ? "" : itemTitle.text(), link.text());
            if (title.isBlank()) {
                continue;
            }
            if (!matchesTitle(title, keyword)) {
                continue;
            }
            String mappedType = mapType(item);
            String cover = "";
            Element image = item.selectFirst("img[src],img[data-original],img[data-src],img[data-lazy-src],img[data-lazyload],img[data-url],img[srcset],img[data-srcset]");
            if (image != null) {
                cover = firstNonBlank(image.attr("abs:data-original"), image.attr("abs:data-src"), image.attr("abs:data-lazyload"),
                        image.attr("abs:data-lazy-src"), image.attr("abs:data-url"),
                        firstSrcsetUrl(image.attr("data-srcset"), pageUrl), firstSrcsetUrl(image.attr("srcset"), pageUrl),
                        image.attr("abs:src"));
            }
            if (cover.isBlank()) {
                cover = extractBackgroundCover(item, pageUrl);
            }
            cover = SearchCoverOverrides.resolve(cover);
            String summary = item.text().replace(title, "").replaceAll("\\s+", " ").trim();
            ExternalSearchHitView candidate = new ExternalSearchHitView(
                    clean(title, 120), href, cover, clean(summary, 180), mappedType);
            String titleKey = normalizeForMatch(title);
            hits.merge(titleKey, candidate, this::preferCandidate);
        }
        return hits.values().stream()
                .filter(hit -> type == null || type.isBlank() || type.equals(hit.type()))
                .limit(limit)
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    private String fetch(URI uri) {
        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(15))
                    .header("Accept", "text/html,application/xhtml+xml")
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36")
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

    private String extractBackgroundCover(Element item, String pageUrl) {
        Element styled = item.selectFirst("[style]");
        if (styled == null) {
            return "";
        }
        String style = styled.attr("style");
        int start = style.indexOf("url(");
        if (start < 0) {
            return "";
        }
        int left = start + 4;
        int end = style.indexOf(")", left);
        if (end <= left) {
            return "";
        }
        String raw = style.substring(left, end).trim().replaceAll("^[\"']|[\"']$", "");
        return safeResolve(raw, pageUrl);
    }

    private String safeResolve(String raw, String pageUrl) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        try {
            return URI.create(pageUrl).resolve(raw).toString();
        } catch (IllegalArgumentException ex) {
            return "";
        }
    }

    private String firstSrcsetUrl(String srcset, String pageUrl) {
        if (srcset == null || srcset.isBlank()) {
            return "";
        }
        String first = srcset.split(",", 2)[0].trim().split("\\s+", 2)[0];
        return safeResolve(first, pageUrl);
    }

    /** 来源分类只在有明确证据时映射，无法识别的候选仅出现在“全部”。 */
    private String mapType(Element item) {
        String sourceType = item.select(".module-card-item-class,.module-info-tag,.video-info-aux a")
                .eachText().stream().sorted(Comparator.comparingInt(String::length)).reduce("", (left, right) -> left + " " + right);
        if (sourceType.matches(".*(动画电影|动漫电影|剧场版|电影).*$")) {
            return "剧场版";
        }
        if (sourceType.matches(".*(网络动画|网络动漫|WEB动画).*$")) {
            return "网络动画";
        }
        if (sourceType.matches(".*(原创动画|原创动漫).*$")) {
            return "原创动画";
        }
        if (sourceType.matches(".*(日韩动漫|日本动漫|国产动漫|欧美动漫|电视动画).*$")) {
            return "电视动画";
        }
        return "";
    }

    /** 同名多来源只展示一次，优先采用分类更明确的播放来源并保留先到的有效封面。 */
    private ExternalSearchHitView preferCandidate(ExternalSearchHitView existing, ExternalSearchHitView candidate) {
        if (typeSpecificity(candidate.type()) <= typeSpecificity(existing.type())) {
            return existing;
        }
        String cover = firstNonBlank(existing.coverUrl(), candidate.coverUrl());
        return new ExternalSearchHitView(candidate.title(), candidate.sourceUrl(), cover,
                candidate.summary(), candidate.type());
    }

    private int typeSpecificity(String type) {
        if ("剧场版".equals(type) || "网络动画".equals(type) || "原创动画".equals(type)) {
            return 2;
        }
        return "电视动画".equals(type) ? 1 : 0;
    }

    /** 每路回源只校验自身查询词，别名扩展的优先级由外层合并负责。 */
    boolean matchesTitle(String title, String keyword) {
        String normalizedKeyword = normalizeForMatch(keyword);
        return normalizedKeyword.isBlank() || normalizeForMatch(title).contains(normalizedKeyword);
    }

    private String normalizeForMatch(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT);
        return normalized.replaceAll("[\\p{P}\\p{S}\\s]+", "");
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
            if (current.selectFirst("img[src],img[data-original],img[data-src],img[data-lazy-src],img[srcset]") != null
                    || current.text().length() > 20) {
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
