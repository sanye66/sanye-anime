package com.sanye.anime.sanye_anime.media;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimePlaybackOption;
import com.sanye.anime.sanye_anime.store.AnimeCatalogStore;
import com.sanye.anime.sanye_anime.store.AnimeMediaStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * 公开页面媒体元数据导入服务：只访问来源页面和同源选集页，不下载第三方媒体内容。
 */
@Service
public class MediaImportService {

    /** 单次作品导入最多并行读取的选集页数量，避免来源站点和本地线程池被打满。 */
    private static final int PAGE_FETCH_CONCURRENCY = 8;
    private static final ExecutorService PAGE_FETCH_EXECUTOR = Executors.newFixedThreadPool(
            PAGE_FETCH_CONCURRENCY, runnable -> {
                Thread thread = new Thread(runnable, "sanye-anime-import-fetch");
                thread.setDaemon(true);
                return thread;
            });

    /** 兼容旧站点的 /p 选集页和当前站点的 /v 播放页。 */
    private static final Pattern EPISODE_PATH = Pattern.compile(
            "^/(?:p/[^/]+/[^/]+/[^/]+|v/[^/]+-[^/]+-[^/]+)/?$");
    /** 当前站点同一部作品可能提供多条线路，默认只取页面第一条线路，避免一集重复三次。 */
    private static final Pattern V_EPISODE_PATH = Pattern.compile("^/v/([^/-]+)-([^/-]+)-([^/-]+)/?$");
    /** 站点页面内公开声明的播放器配置对象。 */
    private static final Pattern PLAYER_CONFIG = Pattern.compile(
            "player_aaaa\\s*=\\s*(\\{.*?\\})\\s*;?", Pattern.DOTALL);
    /** 当前站点公开的多线路播放器配置；file 为去掉三字符前缀后的 URL 编码 Base64。 */
    private static final String TEM_LINE_LIST_VARIABLE = "temLineList";
    /** 兼容非严格 JSON 的播放器配置，例如 url:'https:\/\/example.m3u8'。 */
    private static final Pattern PLAYER_URL_FIELD = Pattern.compile(
            "[\"']?url[\"']?\\s*:\\s*([\"'])(.*?)\\1", Pattern.DOTALL);

    private final AnimeCatalogStore catalogStore;
    private final AnimeMediaStore mediaStore;
    private final MediaPageFetcher pageFetcher;
    private final Set<String> allowedHosts;
    private final int maxEpisodes;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 注入目录、媒体存储、页面读取器和来源白名单。 */
    public MediaImportService(AnimeCatalogStore catalogStore, AnimeMediaStore mediaStore,
                              MediaPageFetcher pageFetcher,
                              @Value("${sanye.media.import.allowed-hosts:yhdmtv.cc,www.yhdmtv.cc}") String allowedHosts,
                              @Value("${sanye.media.import.max-episodes:20}") int maxEpisodes) {
        this.catalogStore = catalogStore;
        this.mediaStore = mediaStore;
        this.pageFetcher = pageFetcher;
        this.allowedHosts = parseHosts(allowedHosts);
        this.maxEpisodes = Math.max(maxEpisodes, 1);
    }

    /** 查询公开作品的剧集；未发布作品不会泄露媒体地址。 */
    public List<AnimeEpisode> listPublicEpisodes(long animeId) {
        if (catalogStore.cardOf(animeId) == null || !catalogStore.isPublished(animeId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return mediaStore.episodesOf(animeId);
    }

    /**
     * 导入作品的公开页面元数据：先完整解析，再一次性替换存储，避免半成功数据覆盖旧数据。
     * 播放地址来自公开 player_aaaa 或 temLineList 配置，只登记地址，不请求或下载媒体流。
     */
    public List<AnimeEpisode> importFrom(long animeId, String sourceUrl) {
        return importFrom(animeId, sourceUrl, null);
    }

    /**
     * 导入已读取的来源页；URL 导入服务可以把元数据页和来源页并发读取，避免重复请求。
     */
    public List<AnimeEpisode> importFrom(long animeId, String sourceUrl, String rootHtml) {
        if (catalogStore.cardOf(animeId) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        List<AnimeEpisode> episodes = parseEpisodes(sourceUrl, rootHtml);
        mediaStore.replaceEpisodes(animeId, episodes);
        return episodes;
    }

    /** 只解析公开页面中的播放资源，不写入作品目录，供站内直接观看预览使用。 */
    public List<AnimeEpisode> parseEpisodes(String sourceUrl, String rootHtml) {
        URI root = validateSourceUrl(sourceUrl);
        String sourceHtml = rootHtml == null || rootHtml.isBlank() ? pageFetcher.fetch(root) : rootHtml;
        Document rootDocument = Jsoup.parse(sourceHtml, root.toString());
        List<PlaybackSource> rootPlaybacks = extractPlaybacks(rootDocument, root);
        List<PlaybackSource> rootLineOptions = isLineOptionList(rootPlaybacks) ? rootPlaybacks : List.of();
        Map<String, String> pages = collectEpisodePages(root, sourceHtml);
        List<AnimeEpisode> episodes = new ArrayList<>();
        int episodeNo = 1;
        for (Map.Entry<String, String> page : pages.entrySet()) {
            if (episodeNo > maxEpisodes) {
                break;
            }
            URI pageUri = URI.create(page.getKey());
            Document document = Jsoup.parse(page.getValue(), pageUri.toString());
            List<PlaybackSource> playbacks = extractPlaybacks(document, pageUri);
            if (playbacks.isEmpty()) {
                continue;
            }
            PlaybackSource playback = playbacks.get(0);
            String playbackUrl = normalizeHttpsUrl(playback.url(), "播放器地址");
            String title = playback.title().isBlank() ? cleanTitle(document.title()) : playback.title();
            if (title.isBlank()) {
                title = "第 " + episodeNo + " 集";
            }
            List<AnimePlaybackOption> playbackOptions = new ArrayList<>(playbacks.stream()
                    .map(option -> new AnimePlaybackOption(
                            normalizeHttpsUrl(option.url(), "备用播放器地址"),
                            option.mimeType(),
                            option.title().isBlank() ? option.label() : option.title()))
                    .filter(option -> !option.url().equals(playbackUrl))
                    .toList());
            // Root alternatives belong to this episode only when its primary URL is in that list.
            List<PlaybackSource> episodeLineOptions = rootLineOptions.stream()
                    .anyMatch(option -> option.url().equals(playbackUrl)) ? rootLineOptions : List.of();
            for (PlaybackSource option : episodeLineOptions) {
                String optionUrl = normalizeHttpsUrl(option.url(), "备用播放器地址");
                if (playbackOptions.stream().noneMatch(item -> item.url().equals(optionUrl))
                        && !optionUrl.equals(playbackUrl)) {
                    playbackOptions.add(new AnimePlaybackOption(optionUrl, option.mimeType(),
                            option.title().isBlank() ? option.label() : option.title()));
                }
            }
            playbackOptions.add(0, new AnimePlaybackOption(playbackUrl, playback.mimeType(),
                    episodeLineOptions.isEmpty()
                            ? (playback.title().isBlank() ? playback.label() : playback.title())
                            : "当前线路"));
            episodes.add(new AnimeEpisode(episodeNo, episodeNo, title, page.getKey(), playbackUrl,
                    playback.mimeType(), playback.label(), playbackOptions));
            episodeNo++;
        }
        return List.copyOf(episodes);
    }

    /** 提取当前播放页的全部公开线路，第一条仍作为旧接口兼容的主线路。 */
    private List<PlaybackSource> extractPlaybacks(Document document, URI pageUri) {
        for (Element script : document.select("script")) {
            var matcher = PLAYER_CONFIG.matcher(script.data());
            boolean matched = matcher.find();
            if (!matched) {
                matcher = PLAYER_CONFIG.matcher(script.html());
                matched = matcher.find();
            }
            if (!matched) {
                continue;
            }
            String url = extractPlayerUrl(matcher.group(1));
            if (!url.isBlank()) {
                return List.of(new PlaybackSource(url, "application/vnd.apple.mpegurl", "公开 HLS 播放源", ""));
            }
        }
        for (Element script : document.select("script")) {
            String lineList = extractAssignedArray(script.data(), TEM_LINE_LIST_VARIABLE);
            if (lineList.isBlank()) {
                lineList = extractAssignedArray(script.html(), TEM_LINE_LIST_VARIABLE);
            }
            if (lineList.isBlank()) {
                continue;
            }
            List<PlaybackSource> sources = extractTemLineSources(lineList, playbackLineId(pageUri));
            if (!sources.isEmpty()) {
                return sources;
            }
        }
        Element iframe = document.select("iframe[src]").first();
        if (iframe == null) {
            return List.of();
        }
        String iframeUrl = iframe.absUrl("src");
        return iframeUrl.isBlank()
                ? List.of()
                : List.of(new PlaybackSource(iframeUrl, "text/html", "公开页面外部播放器", ""));
    }

    /** 从当前站点公开的 temLineList 中读取全部 HLS 线路。 */
    private List<PlaybackSource> extractTemLineSources(String lineListText, Long preferredId) {
        List<PlaybackSource> sources = new ArrayList<>();
        List<PlaybackSource> preferredSources = new ArrayList<>();
        try {
            JsonNode lines = objectMapper.readTree(lineListText);
            if (!lines.isArray()) {
                return List.of();
            }
            for (JsonNode line : lines) {
                String encoded = line.path("file").asText("");
                if (encoded.length() <= 3) {
                    continue;
                }
                String payload = encoded.substring(3);
                String percentEncoded = new String(Base64.getDecoder().decode(payload),
                        java.nio.charset.StandardCharsets.UTF_8);
                String url = URLDecoder.decode(percentEncoded, java.nio.charset.StandardCharsets.UTF_8);
                if (!url.isBlank()) {
                    String title = line.path("name").asText("").trim();
                    if (title.isBlank()) {
                        title = line.path("subTitle").asText("").trim();
                    }
                    PlaybackSource source = new PlaybackSource(url, "application/vnd.apple.mpegurl", "公开 HLS 播放源", title);
                    if (sources.stream().noneMatch(item -> item.url().equals(url))
                            && preferredSources.stream().noneMatch(item -> item.url().equals(url))) {
                        if (preferredId != null && line.path("id").asLong(-1) == preferredId) {
                            preferredSources.add(source);
                        } else {
                            sources.add(source);
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // 外部页面配置变化时继续尝试 iframe，不让单个线路格式阻断整页导入。
        }
        if (!preferredSources.isEmpty() && sources.stream().allMatch(source -> isEpisodeTitle(source.title()))) {
            return List.copyOf(preferredSources);
        }
        preferredSources.addAll(sources);
        return List.copyOf(preferredSources);
    }

    /** 仅把非集数名称的 temLineList 视为同一播放内容的多线路。 */
    private boolean isLineOptionList(List<PlaybackSource> sources) {
        return sources.size() > 1 && sources.stream().noneMatch(source -> isEpisodeTitle(source.title()));
    }

    /** 判断线路名称是否实际是选集名称，避免把相邻集误显示为备用线路。 */
    private boolean isEpisodeTitle(String title) {
        return title != null && title.matches(".*(?:第\\s*\\d+\\s*[集话]|(?:EP|E)\\s*\\d+).*" );
    }

    /** 读取播放页末段线路 ID，用于从多线路配置中选择当前线路。 */
    private Long playbackLineId(URI pageUri) {
        String path = pageUri.getPath() == null ? "" : pageUri.getPath();
        String[] segments = path.split("/");
        if (segments.length < 5 || !"p".equals(segments[1])) {
            return null;
        }
        try {
            long id = Long.parseLong(segments[4]);
            return id > 0 ? id : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    /** 从脚本变量中提取完整数组，避免嵌套 LineList 数组导致正则提前结束。 */
    private String extractAssignedArray(String script, String variableName) {
        if (script == null || script.isBlank()) {
            return "";
        }
        int variableIndex = script.indexOf(variableName);
        if (variableIndex < 0) {
            return "";
        }
        int equalsIndex = script.indexOf('=', variableIndex + variableName.length());
        if (equalsIndex < 0) {
            return "";
        }
        int start = script.indexOf('[', equalsIndex + 1);
        if (start < 0) {
            return "";
        }
        int depth = 0;
        char quote = 0;
        boolean escaped = false;
        for (int index = start; index < script.length(); index++) {
            char current = script.charAt(index);
            if (quote != 0) {
                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == quote) {
                    quote = 0;
                }
                continue;
            }
            if (current == '\'' || current == '"') {
                quote = current;
            } else if (current == '[') {
                depth++;
            } else if (current == ']' && --depth == 0) {
                return script.substring(start, index + 1);
            }
        }
        return "";
    }

    /** 从严格 JSON 或常见 JavaScript 对象写法中提取播放地址。 */
    private String extractPlayerUrl(String configText) {
        try {
            JsonNode config = objectMapper.readTree(configText);
            String url = config.path("url").asText("");
            if (!url.isBlank()) {
                return url;
            }
        } catch (Exception ignored) {
            // 非严格 JSON 继续走字段级提取，不让单集配置格式差异退回 iframe。
        }
        var matcher = PLAYER_URL_FIELD.matcher(configText);
        if (!matcher.find()) {
            return "";
        }
        try {
            return objectMapper.readValue("\"" + matcher.group(2) + "\"", String.class);
        } catch (Exception ignored) {
            return matcher.group(2).replace("\\/", "/").trim();
        }
    }

    /** 收集当前页面和同源选集页，保持页面顺序并去重。 */
    private Map<String, String> collectEpisodePages(URI root, String rootHtml) {
        Map<String, String> pages = new LinkedHashMap<>();
        Document document = Jsoup.parse(rootHtml, root.toString());
        List<Element> selectedLinks = selectEpisodeLinks(document, root);
        boolean hasStructuredPlaylist = !document.select(".module-play-list").isEmpty();
        if (!hasStructuredPlaylist || selectedLinks.isEmpty()) {
            pages.put(root.toString(), rootHtml);
        } else if (selectedLinks.stream()
                .map(link -> link.absUrl("href"))
                .anyMatch(href -> samePage(root, href) && !extractPlaybacks(document, root).isEmpty())) {
            // 播放页本身经常同时出现在选集列表中；直接复用已读 HTML，避免重复请求当前集。
            pages.put(root.toString(), rootHtml);
        }
        String selectedVideoId = null;
        String selectedLine = null;
        List<String> pageUrls = new ArrayList<>();
        for (Element link : selectedLinks) {
            if (pages.size() + pageUrls.size() >= maxEpisodes) {
                break;
            }
            String href = link.absUrl("href");
            var videoMatcher = V_EPISODE_PATH.matcher(URI.create(href).getPath());
            if (videoMatcher.matches()) {
                if (selectedVideoId == null) {
                    selectedVideoId = videoMatcher.group(1);
                    selectedLine = videoMatcher.group(2);
                }
                if (!selectedVideoId.equals(videoMatcher.group(1)) || !selectedLine.equals(videoMatcher.group(2))) {
                    continue;
                }
            }
            if (!pages.containsKey(href) && !pageUrls.contains(href) && !samePage(root, href)) {
                pageUrls.add(href);
            }
        }
        if (!pageUrls.isEmpty()) {
            pages.putAll(fetchPagesInParallel(pageUrls));
        }
        return pages;
    }

    /** 比较页面地址时忽略末尾斜杠，兼容来源页和选集链接的常见写法差异。 */
    private boolean samePage(URI left, String right) {
        try {
            URI candidate = URI.create(right);
            return java.util.Objects.equals(left.getScheme(), candidate.getScheme())
                    && java.util.Objects.equals(left.getRawAuthority(), candidate.getRawAuthority())
                    && java.util.Objects.equals(left.getRawQuery(), candidate.getRawQuery())
                    && trimTrailingSlash(left.getRawPath()).equals(trimTrailingSlash(candidate.getRawPath()));
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private String trimTrailingSlash(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }
        return path.length() > 1 && path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
    }

    /** 并发读取同一作品的选集页，保留原始页面顺序，缩短多集导入等待时间。 */
    private Map<String, String> fetchPagesInParallel(List<String> pageUrls) {
        Map<String, String> pages = new LinkedHashMap<>();
        // 一次提交全部页面，由固定大小的守护线程池限流；不再按 4 个一批形成串行 barrier。
        List<CompletableFuture<String>> futures = pageUrls.stream()
                .map(url -> CompletableFuture.supplyAsync(() -> pageFetcher.fetch(URI.create(url)), PAGE_FETCH_EXECUTOR))
                .toList();
        for (int index = 0; index < pageUrls.size(); index++) {
            pages.put(pageUrls.get(index), awaitPage(futures.get(index)));
        }
        return pages;
    }

    /** 解包并发页面读取异常，保留来源读取器的业务错误。 */
    private String awaitPage(CompletableFuture<String> future) {
        try {
            return future.join();
        } catch (java.util.concurrent.CompletionException ex) {
            if (ex.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw ex;
        }
    }

    /** 从播放列表中优先选择带明确集数标识的线路组，避免把多条线路当成多集。 */
    private List<Element> selectEpisodeLinks(Document document, URI root) {
        List<List<Element>> groups = new ArrayList<>();
        for (Element playlist : document.select(".module-play-list")) {
            List<Element> links = validEpisodeLinks(playlist.select("a[href]"), root);
            if (!links.isEmpty()) {
                groups.add(links);
            }
        }
        if (groups.isEmpty()) {
            return validEpisodeLinks(document.select("a[href]"), root);
        }
        for (List<Element> group : groups) {
            if (group.stream().anyMatch(this::hasEpisodeLabel)) {
                return group;
            }
        }
        return groups.get(0);
    }

    /** 过滤为同源的播放页链接，保留旧页面没有播放列表容器时的兼容回退。 */
    private List<Element> validEpisodeLinks(List<Element> links, URI root) {
        return links.stream()
                .filter(link -> {
                    String href = link.absUrl("href");
                    try {
                        return isSameAllowedHost(root, href)
                                && EPISODE_PATH.matcher(URI.create(href).getPath()).matches();
                    } catch (IllegalArgumentException ex) {
                        return false;
                    }
                })
                .toList();
    }

    /** 判断播放列表链接是否代表明确的第几集。 */
    private boolean hasEpisodeLabel(Element link) {
        String label = (link.attr("title") + " " + link.text()).replaceAll("\\s+", " ");
        return label.matches(".*(?:第\\s*\\d+\\s*[集话]|(?:EP|E)\\s*\\d+).*" );
    }

    /** 校验导入来源必须是 HTTPS 且命中精确白名单，阻断 SSRF 和任意 URL 读取。 */
    public URI validateSourceUrl(String sourceUrl) {
        if (sourceUrl == null || sourceUrl.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "来源地址不能为空");
        }
        try {
            URI uri = URI.create(sourceUrl.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || !allowedHosts.contains(uri.getHost().toLowerCase(Locale.ROOT))) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "来源地址不在允许的 HTTPS 域名白名单中");
            }
            return uri;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "来源地址格式无效");
        }
    }

    /** 只接受 HTTPS 播放器地址，播放器地址本身不由服务端继续请求。 */
    private String normalizeHttpsUrl(String value, String label) {
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, label + "必须是 HTTPS 地址");
            }
            return uri.toString();
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, label + "格式无效");
        }
    }

    /** 判断选集链接是否仍在同一授权来源域名。 */
    private boolean isSameAllowedHost(URI root, String href) {
        try {
            URI uri = URI.create(href);
            return root.getHost().equalsIgnoreCase(uri.getHost())
                    && allowedHosts.contains(uri.getHost().toLowerCase(Locale.ROOT))
                    && "https".equalsIgnoreCase(uri.getScheme());
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    /** 清理页面标题，避免把空白和换行写入剧集名称。 */
    private String cleanTitle(String title) {
        String cleaned = title == null ? "" : title.replaceAll("\\s+", " ")
                .replaceFirst("\\s*[|｜-]\\s*(?:日本动漫大全|樱花动漫).*$", "")
                .trim();
        return cleaned.replaceFirst("^正在播放《(.+?)》.*$", "$1").trim();
    }

    /** 播放地址及其媒体类型，避免把 HLS 地址误当成 HTML iframe。 */
    private record PlaybackSource(String url, String mimeType, String label, String title) {
    }

    /** 解析并规范化域名白名单。 */
    private Set<String> parseHosts(String value) {
        Set<String> hosts = new java.util.HashSet<>();
        for (String item : value.split(",")) {
            if (!item.isBlank()) {
                hosts.add(item.trim().toLowerCase(Locale.ROOT));
            }
        }
        return Set.copyOf(hosts);
    }
}
