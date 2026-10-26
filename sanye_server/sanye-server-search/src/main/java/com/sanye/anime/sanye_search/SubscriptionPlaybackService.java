package com.sanye.anime.sanye_search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_search.model.ExternalSearchHitView;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

/** 声明式订阅解析；不执行脚本、用户正则或浏览器请求头规则。 */
@Service
public class SubscriptionPlaybackService {
    private static final Semaphore REQUESTS = new Semaphore(4);
    private static final Pattern URL_LITERAL = Pattern.compile("https://[^\\s\"'<>\\\\]+", Pattern.CASE_INSENSITIVE);
    private final ObjectMapper mapper;
    private final SubscriptionFetchService.Fetcher fetcher;
    interface UrlValidator { void validate(String url) throws Exception; }
    private final UrlValidator validator;
    record Source(int index, String name, boolean rss, JsonNode config, URI origin) {}
    public record Episode(long id, int episodeNo, String title, String sourcePageUrl, String playbackUrl,
                          String mimeType, String sourceLabel) {}
    public record Preview(String title, String sourceUrl, List<String> tags, String type,
                          List<Episode> episodes, List<String> warnings) {}
    public record Playback(String url, String mimeType, List<String> warnings) {}

    @org.springframework.beans.factory.annotation.Autowired
    public SubscriptionPlaybackService(ObjectMapper mapper) { this(mapper, SubscriptionFetchPolicy::fetch, SubscriptionFetchPolicy::validatePublic); }
    SubscriptionPlaybackService(ObjectMapper mapper, SubscriptionFetchService.Fetcher fetcher) {
        this(mapper, fetcher, SubscriptionFetchPolicy::validatePublic);
    }
    SubscriptionPlaybackService(ObjectMapper mapper, SubscriptionFetchService.Fetcher fetcher, UrlValidator validator) {
        this.mapper = mapper; this.fetcher = fetcher; this.validator = validator;
    }
    public List<ExternalSearchHitView> search(String content, String keyword, Integer requestedSize) {
        return search(content, keyword, requestedSize, null);
    }

    public List<ExternalSearchHitView> search(String content, String keyword, Integer requestedSize, Integer sourceIndex) {
        if (keyword == null || keyword.isBlank() || keyword.length() > 200) throw invalid("搜索关键词不能为空且不能超过 200 字符");
        int size = requestedSize == null ? 30 : Math.max(1, Math.min(100, requestedSize));
        List<Source> sources = sourceIndex != null && sourceIndex == -1
            ? sources(content).stream().filter(Source::rss).toList()
            : selectedSources(sources(content), sourceIndex);
        List<ExternalSearchHitView> hits = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int succeeded = 0;
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
        for (Source source : sources) {
            if (hits.size() >= size || System.nanoTime() > deadline) break;
            try {
                String term = keyword.trim();
                if (source.config.path("searchRemoveSpecial").asBoolean()) term = term.replaceAll("[^\\p{L}\\p{N}\\s]", " ").trim();
                if (source.config.path("searchUseOnlyFirstWord").asBoolean()) term = term.split("\\s+")[0];
                String url = source.config.path("searchUrl").asText().replace("{keyword}", URLEncoder.encode(term, StandardCharsets.UTF_8).replace("+", "%20"))
                        .replace("[", "%5B").replace("]", "%5D").replace("{", "%7B").replace("}", "%7D").replace("\"", "%22");
                var document = source.rss ? Jsoup.parse(read(url), url, Parser.xmlParser()) : Jsoup.parse(read(url), url);
                succeeded++;
                if (source.rss) {
                    for (Element item : document.select("item")) {
                        String title = item.select("title").text();
                        String link = item.select("link").text();
                        Element enclosure = item.selectFirst("enclosure[url]");
                        if (enclosure != null) link = enclosure.attr("url");
                        if (!resourceUrl(link)) continue;
                        if (!title.isBlank() && seen.add(link)) hits.add(new ExternalSearchHitView(title, link, "", source.name + " · BT 资源，不支持在线播放", "resource"));
                        if (hits.size() >= size) break;
                    }
                } else {
                    JsonNode c = source.config;
                    boolean indexed = "indexed".equals(c.path("subjectFormatId").asText());
                    JsonNode rule = c.path(indexed ? "selectorSubjectFormatIndexed" : "selectorSubjectFormatA");
                    Elements names = select(document, rule.path(indexed ? "selectNames" : "selectLists").asText());
                    Elements links = indexed ? select(document, rule.path("selectLinks").asText()) : names;
                    for (int i = 0; i < Math.min(names.size(), links.size()) && hits.size() < size; i++) {
                        try {
                        String title = names.get(i).text().trim();
                        String link = absolute(source, url, links.get(i).attr("href"));
                        if (!title.isBlank() && sameOrigin(source.origin, URI.create(link)) && seen.add(link))
                            hits.add(new ExternalSearchHitView(title, link, "", source.name, "anime"));
                        } catch (Exception ignored) { /* 跳过非法链接，保留其余条目。 */ }
                    }
                }
            } catch (Exception ignored) { /* 单个站点失败不抹掉其他站点结果。 */ }
        }
        if (succeeded == 0) throw invalid("订阅搜索来源均不可用，可能为 HTTPS 限制、重定向、站点防护或不支持的规则");
        return List.copyOf(hits);
    }

    public Preview preview(String content, String sourceUrl, String title) {
        return preview(content, sourceUrl, title, null);
    }

    public Preview preview(String content, String sourceUrl, String title, Integer sourceIndex) {
        Source source = match(sources(content), sourceUrl, sourceIndex);
        if (source.rss) throw invalid("BT 订阅仅提供资源下载，不支持在线播放");
        try {
            var doc = Jsoup.parse(read(sourceUrl), sourceUrl);
            List<Episode> episodes = new ArrayList<>();
            JsonNode c = source.config;
            boolean grouped = "index-grouped".equals(c.path("channelFormatId").asText());
            JsonNode rule = c.path(grouped ? "selectorChannelFormatFlattened" : "selectorChannelFormatNoChannel");
            Elements groups = grouped ? select(doc, rule.path("selectEpisodeLists").asText()) : new Elements(doc);
            Elements channels = grouped ? optionalSelect(doc, rule.path("selectChannelNames").asText()) : new Elements();
            Set<String> seen = new HashSet<>();
            for (int g = 0; g < Math.min(groups.size(), 32); g++) {
                Elements names = select(groups.get(g), rule.path(grouped ? "selectEpisodesFromList" : "selectEpisodes").asText());
                String linkSelector = rule.path(grouped ? "selectEpisodeLinksFromList" : "selectEpisodeLinks").asText();
                Elements links = linkSelector.isBlank() ? names : select(groups.get(g), linkSelector);
                String channel = g < channels.size() ? channels.get(g).text() : source.name;
                for (int i = 0; i < Math.min(names.size(), links.size()) && episodes.size() < 500; i++) {
                    try {
                    String url = absolute(source, sourceUrl, links.get(i).attr("href"));
                    if (!sameOrigin(source.origin, URI.create(url)) || !seen.add(url)) continue;
                    String episodeTitle = names.get(i).text();
                    var number = Pattern.compile("\\d+").matcher(episodeTitle);
                    int no = i + 1;
                    if (number.find()) { try { no = Integer.parseInt(number.group()); } catch (NumberFormatException ignored) { } }
                    episodes.add(new Episode(episodes.size() + 1L, no, episodeTitle, url, "", "", channel));
                    } catch (Exception ignored) { /* 来源不能用非法链接污染其他选集。 */ }
                }
            }
            if (episodes.isEmpty()) throw invalid("订阅详情未找到选集；不支持的频道格式或需要浏览器执行脚本");
            return new Preview(title == null || title.isBlank() ? doc.title() : title, sourceUrl, List.of(source.name), "anime", List.copyOf(episodes), warnings(source));
        } catch (BusinessException failure) { throw failure; }
        catch (Exception failure) { throw invalid("订阅详情读取失败，请检查 HTTPS 来源、选择器和网络连接"); }
    }

    public Playback resolve(String content, String sourceUrl) {
        return resolve(content, sourceUrl, null);
    }

    public Playback resolve(String content, String sourceUrl, Integer sourceIndex) {
        Source source = match(sources(content), sourceUrl, sourceIndex);
        if (source.rss) throw invalid("BT 资源不能作为在线播放地址");
        try {
            String html = read(sourceUrl).replace("\\/", "/");
            var doc = Jsoup.parse(html, sourceUrl);
            LinkedHashSet<String> candidates = new LinkedHashSet<>();
            for (Element e : doc.select("video[src], video source[src], source[src]")) candidates.add(e.absUrl("src"));
            // 仅提取静态字符串，不运行内联脚本或订阅中的正则表达式。
            var matcher = URL_LITERAL.matcher(html);
            while (matcher.find() && candidates.size() < 100) candidates.add(matcher.group().replace("&amp;", "&"));
            var literals = Pattern.compile("[\"']?url[\"']?\\s*:\\s*[\"']([^\"']{1,4096})[\"']", Pattern.CASE_INSENSITIVE).matcher(html);
            for (int count = 0; count < 32 && literals.find(); count++) {
                String value = literals.group(1);
                try { candidates.add(java.net.URLDecoder.decode(value, StandardCharsets.UTF_8)); } catch (IllegalArgumentException ignored) { }
                try {
                    String decoded = new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
                    if (decoded.startsWith("https://")) candidates.add(decoded);
                } catch (IllegalArgumentException ignored) { }
            }
            for (String candidate : candidates) {
                try {
                    URI uri = publicUrl(candidate);
                    String mime = mime(uri);
                    if (!mime.isEmpty()) return new Playback(uri.toString(), mime, warnings(source));
                } catch (Exception ignored) { }
            }
            throw invalid("未找到静态 HTTPS 视频地址；需要脚本、嵌套解析或专用请求头的来源不能直接播放");
        } catch (BusinessException failure) { throw failure; }
        catch (Exception failure) { throw invalid("订阅播放解析失败，请检查来源和网络连接"); }
    }

    private List<String> warnings(Source source) {
        List<String> result = new ArrayList<>();
        result.add("直链未经过浏览器播放验证，跨域权限由视频站点决定");
        JsonNode video = source.config.path("matchVideo");
        if (!video.path("cookies").asText().isBlank() || video.path("addHeadersToVideo").size() > 0)
            result.add("订阅声明了 Cookie 或视频请求头；网页播放器不能设置 Cookie、Referer 或 User-Agent，未代理这些要求");
        return List.copyOf(result);
    }
    private List<Source> sources(String content) {
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > SubscriptionFetchPolicy.MAX_BYTES) throw invalid("订阅配置为空或超过 2 MB");
        try (var parser = mapper.getFactory().createParser(content)) {
            JsonNode root = mapper.readTree(parser);
            if (root == null || parser.nextToken() != null) throw invalid("订阅配置必须是单个 JSON 文档");
            JsonNode nodes = root.path("exportedMediaSourceDataList").path("mediaSources");
            if (!nodes.isArray() || nodes.size() > 24) throw invalid("订阅来源必须为数组且不能超过 24 个");
            List<Source> result = new ArrayList<>();
            for (int index = 0; index < nodes.size(); index++) {
                JsonNode node = nodes.get(index);
                boolean rss = "rss".equals(node.path("factoryId").asText()) && node.path("version").asInt() == 1;
                boolean web = "web-selector".equals(node.path("factoryId").asText()) && node.path("version").asInt() == 2;
                if (!rss && !web) continue;
                JsonNode c = node.path("arguments").path("searchConfig");
                if (web && (!Set.of("a", "indexed").contains(c.path("subjectFormatId").asText())
                        || !Set.of("index-grouped", "no-channel").contains(c.path("channelFormatId").asText()))) continue;
                try {
                    URI origin = SubscriptionFetchPolicy.validateUrl(c.path("searchUrl").asText().replace("{keyword}", "query").replace("[", "%5B").replace("]", "%5D").replace("{", "%7B").replace("}", "%7D").replace("\"", "%22"));
                    result.add(new Source(index, node.path("arguments").path("name").asText("订阅"), rss, c, origin));
                } catch (Exception ignored) { }
            }
            if (result.isEmpty()) throw invalid("没有支持的 HTTPS web-selector v2 或 RSS v1 来源");
            return result;
        } catch (BusinessException failure) { throw failure; }
        catch (Exception failure) { throw invalid("订阅配置格式无效"); }
    }
    private List<Source> selectedSources(List<Source> sources, Integer sourceIndex) {
        if (sourceIndex == null) return sources;
        return List.of(sources.stream().filter(source -> source.index == sourceIndex).findFirst()
            .orElseThrow(() -> invalid("所选订阅来源不存在或不受支持")));
    }

    private Source match(List<Source> sources, String url, Integer sourceIndex) {
        try {
            URI uri = SubscriptionFetchPolicy.validateUrl(url);
            List<Source> matching = selectedSources(sources, sourceIndex).stream()
                .filter(source -> sameOrigin(source.origin, uri)).toList();
            if (matching.isEmpty()) throw invalid("链接不属于当前订阅来源");
            if (sourceIndex == null && matching.size() > 1) throw invalid("同一站点存在多条来源规则，请重新选择来源");
            return matching.getFirst();
        } catch (BusinessException failure) { throw failure; }
        catch (Exception failure) { throw invalid("来源链接必须为公网 HTTPS 地址"); }
    }
    private String read(String url) throws Exception {
        SubscriptionFetchPolicy.validateUrl(url);
        if (!REQUESTS.tryAcquire()) throw invalid("订阅请求繁忙，请稍后重试");
        try {
            String body = fetcher.fetch(url);
            if (body == null || body.getBytes(StandardCharsets.UTF_8).length > SubscriptionFetchPolicy.MAX_BYTES) throw invalid("来源正文为空或超过 2 MB");
            return body;
        } finally { REQUESTS.release(); }
    }
    private URI publicUrl(String url) throws Exception {
        URI uri = SubscriptionFetchPolicy.validateUrl(url);
        validator.validate(url);
        return uri;
    }
    private static String mime(URI uri) {
        String path = Optional.ofNullable(uri.getPath()).orElse("").toLowerCase(Locale.ROOT);
        if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (path.endsWith(".mp4")) return "video/mp4";
        if (path.endsWith(".webm")) return "video/webm";
        return "";
    }
    private static boolean resourceUrl(String url) {
        if (url.startsWith("magnet:?xt=urn:btih:")) return url.length() < 4096;
        try { SubscriptionFetchPolicy.validateUrl(url); return true; } catch (Exception failure) { return false; }
    }
    private static boolean sameOrigin(URI left, URI right) { return left.getHost().equalsIgnoreCase(right.getHost()); }
    private static String absolute(Source source, String page, String href) throws Exception {
        if (href.isBlank()) throw new IllegalArgumentException();
        String base = source.config.path("rawBaseUrl").asText();
        return SubscriptionFetchPolicy.validateUrl(URI.create(base.isBlank() ? page : base).resolve(href).toString()).toString();
    }
    private static Elements optionalSelect(Element element, String selector) { return selector.isBlank() ? new Elements() : select(element, selector); }
    private static Elements select(Element element, String selector) {
        if (selector.isBlank() || selector.length() > 512 || selector.contains(":matches")) throw invalid("选择器为空、过长或包含不支持的正则");
        return element.select(selector);
    }
    private static BusinessException invalid(String message) { return new BusinessException(ErrorCode.PARAM_INVALID, message); }
}
