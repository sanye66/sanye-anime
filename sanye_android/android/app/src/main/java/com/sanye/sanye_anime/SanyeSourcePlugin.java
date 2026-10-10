package com.sanye.sanye_anime;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URLEncoder;
import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.Base64;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/** PC 端公开来源规则的设备端只读子集：不执行来源脚本，不请求任意目标。 */
@CapacitorPlugin(name = "SanyeSource")
public class SanyeSourcePlugin extends Plugin {
    record SearchHit(String title, String sourceUrl, String coverUrl, String summary) {}
    record PreviewEpisode(String id, String title, String sourceUrl, String playbackUrl, String mimeType, String lineId) {}
    record SourcePreview(String title, String sourceUrl, String coverUrl, String summary, List<PreviewEpisode> episodes) {}
    private static final String SEARCH_RESULTS = "https://www.yhdmtv.cc/public/auto/search1.html?keyword=";
    private static final String SEARCH_PAGE = "https://www.yhdmtv.cc/search/index.html?keyword=";
    private static final Pattern PLAYER_CONFIG = Pattern.compile("player_aaaa\\s*=\\s*(\\{.*?\\})\\s*;?", Pattern.DOTALL);
    private static final Pattern PLAYER_URL = Pattern.compile("[\\\"']?url[\\\"']?\\s*:\\s*([\\\"'])(.*?)\\1", Pattern.DOTALL);
    private static final int MAX_HTML_BYTES = 2 * 1024 * 1024;
    /** 并发探测的首集候选条数：覆盖“首选线路 404/超时”的常见情况，同时对来源保持克制。 */
    private static final int HYDRATE_CANDIDATES = 3;
    /**
     * 首集媒体探测的时间预算。详情页与选集必须尽快返回给界面，
     * 超过预算就让客户端按需再取一次播放页，不能把首屏拖成数秒空白。
     */
    private static final long HYDRATE_BUDGET_NANOS = 1_000_000_000L;
    /** 同一次点击链路里详情页与播放页常被重复请求，短时缓存可以省掉整轮往返。 */
    private static final long PREVIEW_CACHE_TTL_NANOS = 20_000_000_000L;
    private static final int PREVIEW_CACHE_LIMIT = 24;
    /**
     * 速度优先：来源站点响应波动很大（同一入口实测 19s、53s、甚至直接连接超时），
     * 长时间等待会把“点击立即观看”拖成十几秒空白。单次请求与整体期限收到 6s／15s，
     * 慢或不可用的来源尽早失败，由客户端用随包已有线路接管播放。
     */
    private static final int REQUEST_TIMEOUT_MILLIS = 6_000;
    private static final long REQUEST_DEADLINE_NANOS = 15_000_000_000L;
    /** 单个请求的等待上限（搜索并发兜底与首集探测共用），避免把界面拖到整体期限。 */
    private static final long SINGLE_REQUEST_WAIT_MILLIS = 6_000L;
    private static final String TAG = "SanyeSource";
    private static Thread daemonThread(Runnable runnable) {
        Thread thread = new Thread(runnable, "sanye-android-source");
        thread.setDaemon(true);
        return thread;
    }
    /** 预览请求池：只跑详情页与播放页的抓取解析，不与搜索抢占线程。 */
    private final ExecutorService requests = Executors.newFixedThreadPool(6, SanyeSourcePlugin::daemonThread);
    /**
     * 搜索请求池与预览池分开（VQ-60）：并发详情预览最多可以占满 6 条线程，
     * 搜索排在同一个池里时连任务都排不上，界面只能一直停在「读取中」直到整体期限。
     */
    private final ExecutorService searches = Executors.newFixedThreadPool(2, SanyeSourcePlugin::daemonThread);
    /**
     * 搜索入口竞速单独排队：首集媒体探测会长时间占用自己的线程（阻塞式 HTTP 读无法被中断），
     * 若与搜索共用队列，连点两次搜索时后一次会在队列里等到超时，表现为“搜不到”。
     * 每次搜索会同时占用两个入口，因此容量按「两个并发搜索」配置。
     */
    private final ExecutorService searchRace = Executors.newFixedThreadPool(4, SanyeSourcePlugin::daemonThread);
    /** 首集媒体探测单独排队，不与搜索/预览抢占同一个队列。 */
    private final ExecutorService hydration = Executors.newFixedThreadPool(HYDRATE_CANDIDATES, SanyeSourcePlugin::daemonThread);
    private final Map<String, CachedPreview> previewCache = new ConcurrentHashMap<>();
    private record CachedPreview(long expiresAt, SourcePreview preview) {}
    /** 搜索竞速结果：failure 为 null 表示至少有一个入口真的取到了页面（空列表＝确实没有匹配）。 */
    record SearchOutcome(List<SearchHit> hits, Exception failure) {}

    /**
     * 插件随 Bridge 销毁时回收自有线程池。
     * 三个池都是 daemon 线程，不回收不会拖住进程退出，但每次 WebView 重建都会新建一个插件实例，
     * 池里的线程和缓存会随之累积。
     */
    @Override
    protected void handleOnDestroy() {
        requests.shutdownNow();
        searches.shutdownNow();
        searchRace.shutdownNow();
        hydration.shutdownNow();
        previewCache.clear();
        super.handleOnDestroy();
    }

    /** 仅供本模块单元测试核对线程池与缓存行为。 */
    ExecutorService searchRaceExecutor() { return searchRace; }

    ExecutorService hydrationExecutor() { return hydration; }

    ExecutorService searchExecutor() { return searches; }

    int previewCacheSize() { return previewCache.size(); }

    /**
     * 提交请求任务，并把「线程池已回收」也变成一次明确的错误回调（VQ-62）。
     *
     * 池在 Bridge 销毁时 shutdownNow，之后 submit 会抛 RejectedExecutionException；
     * 这个异常会从 @PluginMethod 里冒出去，而 Capacitor 的 Bridge 对插件方法抛出的异常是
     * 直接 rethrow（插件线程停摆、这次调用永不返回），所以必须在提交处兜住。
     */
    private void submit(ExecutorService pool, Runnable task, PluginCall call) {
        try {
            pool.execute(task);
        } catch (RuntimeException rejected) {
            Log.w(TAG, "来源请求池已回收，拒绝新任务", rejected);
            call.reject("来源请求已停止，请重新打开页面", "E_SOURCE_UNAVAILABLE", rejected);
        }
    }

    @PluginMethod
    public void search(PluginCall call) {
        String keyword = call.getString("keyword", "").trim();
        // 字数按码点计：按 UTF-16 长度会把 emoji/代理对算成两个字，与「1–50 字」的约定不一致。
        if (keyword.isEmpty() || keyword.codePointCount(0, keyword.length()) > 50) {
            call.reject("请输入 1–50 字的搜索词", "E_SOURCE_KEYWORD");
            return;
        }
        // 期限在入队前起算（VQ-60）：以前在任务体里起算，池满时的排队时间完全不计入期限，
        // 从桥接调用到 reject 可以远超 15s，界面只会一直显示「读取中」。
        long deadline = System.nanoTime() + REQUEST_DEADLINE_NANOS;
        submit(searches, () -> {
            SearchOutcome outcome;
            try {
                String encoded = URLEncoder.encode(keyword, StandardCharsets.UTF_8.name());
                outcome = searchBoth(keyword, SEARCH_RESULTS + encoded, SEARCH_PAGE + encoded, deadline);
            } catch (Exception failure) {
                outcome = new SearchOutcome(List.of(), failure);
            }
            if (outcome.failure() != null) {
                // 两个入口都没能取到页面＝来源不可用，必须报错（VQ-60）。
                // 以前这里返回空列表，界面把它当成「没有找到匹配作品」，而客户端的一次静默重试
                // 只对 reject 生效，于是重试永远不会发生，用户第一次搜索就可能被判成没有结果。
                Log.w(TAG, "来源搜索失败：" + keyword, outcome.failure());
                call.reject("来源搜索暂不可用，请检查网络或稍后重试", "E_SOURCE_UNAVAILABLE", outcome.failure());
                return;
            }
            JSObject response = new JSObject();
            JSArray items = new JSArray();
            for (SearchHit hit : outcome.hits()) {
                JSObject object = new JSObject();
                object.put("title", hit.title()); object.put("sourceUrl", hit.sourceUrl());
                object.put("coverUrl", hit.coverUrl()); object.put("summary", hit.summary());
                items.put(object);
            }
            response.put("hits", items);
            call.resolve(response);
        }, call);
    }

    /**
     * 两个公开搜索入口并发请求，采用先返回且非空的结果。
     * 串行写法在首选入口超时时要等满超时再打第二个入口，用户感知就是“搜索很慢”。
     */
    private SearchOutcome searchBoth(String keyword, String resultsUrl, String pageUrl, long deadline) {
        return raceSearch(deadline, List.of(
            () -> parseSearch(fetch(URI.create(resultsUrl), deadline), resultsUrl, keyword),
            () -> parseSearch(fetch(URI.create(pageUrl), deadline), pageUrl, keyword)));
    }

    /**
     * 并发跑多个搜索入口，先返回非空结果者胜。
     *
     * 收尾语义（VQ-60）：只要有一个入口真的取到了页面，空列表就是「确实没有匹配」；
     * 全部失败或超时才是「来源不可用」，由调用方 reject，让客户端的一次静默重试真正生效。
     */
    SearchOutcome raceSearch(long deadline, List<Callable<List<SearchHit>>> entries) {
        ExecutorCompletionService<List<SearchHit>> race = new ExecutorCompletionService<>(searchRace);
        for (Callable<List<SearchHit>> entry : entries) race.submit(entry);
        Exception lastFailure = null;
        boolean reachable = false;
        for (int attempt = 0; attempt < entries.size(); attempt++) {
            long remaining = (deadline - System.nanoTime()) / 1_000_000L;
            if (remaining <= 0) {
                if (lastFailure == null) lastFailure = new TimeoutException("搜索超过整体期限");
                break;
            }
            Future<List<SearchHit>> finished;
            try {
                finished = race.poll(Math.min(remaining, SINGLE_REQUEST_WAIT_MILLIS), TimeUnit.MILLISECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                lastFailure = interrupted;
                break;
            }
            if (finished == null) {
                if (lastFailure == null) lastFailure = new TimeoutException("搜索入口未在等待上限内返回");
                break;
            }
            try {
                List<SearchHit> hits = finished.get();
                if (!hits.isEmpty()) return new SearchOutcome(hits, null);
                reachable = true;
            } catch (Exception failure) {
                // 一个入口失败不影响另一个；两个都失败时把最后一个原因带给调用方。
                lastFailure = failure;
            }
        }
        return new SearchOutcome(List.of(), reachable ? null : lastFailure);
    }

    @PluginMethod
    public void preview(PluginCall call) {
        String sourceUrl = call.getString("sourceUrl", "").trim();
        URI uri;
        try {
            uri = URI.create(sourceUrl);
            if (!allowedDetail(uri)) { call.reject("只支持已适配来源的 HTTPS 详情页", "E_SOURCE_URL"); return; }
        } catch (Exception ignored) { call.reject("来源地址无效", "E_SOURCE_URL"); return; }
        // 同上：期限在入队前起算，池满时的排队时间也计入这次预览的整体期限。
        long deadline = System.nanoTime() + REQUEST_DEADLINE_NANOS;
        submit(requests, () -> {
            try {
                CachedPreview cachedPreview = previewCache.get(sourceUrl);
                if (cachedPreview != null && cachedPreview.expiresAt() > System.nanoTime()) {
                    call.resolve(previewJson(cachedPreview.preview()));
                    return;
                }
                SourcePreview preview = hydrateFirstPlayback(parsePreview(fetch(uri, deadline), uri.toString()),
                    Math.min(deadline, System.nanoTime() + HYDRATE_BUDGET_NANOS));
                rememberPreview(sourceUrl, preview);
                call.resolve(previewJson(preview));
            } catch (Exception failure) {
                // 失败原因带进 reject：Capacitor 只在这时才会把异常写进日志，否则线上只有一句中文文案。
                Log.w(TAG, "来源预览失败：" + sourceUrl, failure);
                call.reject("来源预览暂不可用，请检查网络或稍后重试", "E_SOURCE_UNAVAILABLE", failure);
            }
        }, call);
    }

    private static JSObject previewJson(SourcePreview preview) {
        JSObject result = new JSObject();
        result.put("title", preview.title()); result.put("sourceUrl", preview.sourceUrl());
        result.put("coverUrl", preview.coverUrl()); result.put("summary", preview.summary());
        JSArray episodes = new JSArray();
        for (PreviewEpisode entry : preview.episodes()) {
            JSObject object = new JSObject();
            object.put("id", entry.id()); object.put("title", entry.title());
            object.put("sourceUrl", entry.sourceUrl()); object.put("playbackUrl", entry.playbackUrl());
            object.put("mimeType", entry.mimeType()); object.put("lineId", entry.lineId());
            episodes.put(object);
        }
        result.put("episodes", episodes);
        return result;
    }

    /** 供单元测试与预览路径共用，便于核对淘汰策略不会整表清空。 */
    void rememberPreview(String sourceUrl, SourcePreview preview) {
        long now = System.nanoTime();
        if (previewCache.size() >= PREVIEW_CACHE_LIMIT) {
            for (Map.Entry<String, CachedPreview> entry : previewCache.entrySet()) {
                if (entry.getValue().expiresAt() <= now) previewCache.remove(entry.getKey());
            }
            // 仍然超限时只淘汰最快过期的一条（VQ-60）：以前这里整表 clear()，
            // 浏览超过 24 部作品就会把刚看过的作品一起清空，返回列表又要重新等一整轮网络。
            while (previewCache.size() >= PREVIEW_CACHE_LIMIT) {
                String oldest = null;
                long oldestExpiry = Long.MAX_VALUE;
                for (Map.Entry<String, CachedPreview> entry : previewCache.entrySet()) {
                    if (entry.getValue().expiresAt() < oldestExpiry) {
                        oldestExpiry = entry.getValue().expiresAt();
                        oldest = entry.getKey();
                    }
                }
                if (oldest == null) break;
                previewCache.remove(oldest);
            }
        }
        previewCache.put(sourceUrl, new CachedPreview(now + PREVIEW_CACHE_TTL_NANOS, preview));
    }

    /**
     * PC 端外部预览会在返回前准备首个可播放媒体；安卓也必须一次返回首集媒体，
     * 否则点击立即观看会变成“详情请求完成后再串行请求播放页”的双倍等待。
     *
     * 首集线路整体失效（清单 404 或超时）时，串行重试会把各条候选的等待直接相加；
     * 这里并发探测最多 {@link #HYDRATE_CANDIDATES} 条候选，再按原始顺序采纳结果，
     * 既不叠加超时，也不会让后面的线路抢先替换用户看到的线路顺序。
     */
    private SourcePreview hydrateFirstPlayback(SourcePreview preview, long deadline) {
        List<Integer> candidates = new ArrayList<>();
        for (int index = 0; index < preview.episodes().size() && candidates.size() < HYDRATE_CANDIDATES; index++) {
            PreviewEpisode episode = preview.episodes().get(index);
            if (episode.playbackUrl().isBlank() && !episode.sourceUrl().isBlank()) candidates.add(index);
        }
        if (candidates.isEmpty()) return preview;
        Map<Integer, PreviewEpisode> resolved = new ConcurrentHashMap<>();
        List<Future<?>> probes = new ArrayList<>(candidates.size());
        for (int index : candidates) {
            PreviewEpisode episode = preview.episodes().get(index);
            probes.add(hydration.submit(() -> {
                try {
                    SourcePreview playback = parsePreview(fetch(URI.create(episode.sourceUrl()), deadline), episode.sourceUrl());
                    playback.episodes().stream().filter(item -> !item.playbackUrl().isBlank()).findFirst().ifPresent(found ->
                        resolved.put(index, new PreviewEpisode(episode.id(), episode.title(), episode.sourceUrl(), found.playbackUrl(), found.mimeType(),
                            episode.lineId().equals("main") ? found.lineId() : episode.lineId())));
                } catch (Exception ignored) {
                    // 单条候选失败不影响其他候选；全部失败时仍返回未补全的预览，由上层提示重试。
                }
            }));
        }
        // 按原始顺序等待，但不丢弃已经探测成功的其他候选（VQ-60）：以前第 0 条一超时就
        // cancel 全部并原样返回，候选中已经拿到的首集直链被一起扔掉，首集补全率低于设计目标。
        for (int position = 0; position < candidates.size(); position++) {
            long remaining = (deadline - System.nanoTime()) / 1_000_000L;
            try {
                probes.get(position).get(Math.max(1L, Math.min(remaining, SINGLE_REQUEST_WAIT_MILLIS)), TimeUnit.MILLISECONDS);
            } catch (Exception expired) {
                break;
            }
            // 该候选返回但没解析出直链时继续等下一个；已经拿到直链就可以收尾。
            if (resolved.containsKey(candidates.get(position))) break;
        }
        for (Future<?> probe : probes) probe.cancel(true);
        if (resolved.isEmpty()) return preview;
        List<PreviewEpisode> episodes = new ArrayList<>(preview.episodes());
        for (int index : candidates) {
            PreviewEpisode hit = resolved.get(index);
            if (hit != null) episodes.set(index, hit);
        }
        return new SourcePreview(preview.title(), preview.sourceUrl(), preview.coverUrl(), preview.summary(), List.copyOf(episodes));
    }

    static List<SearchHit> parseSearch(String html, String pageUrl, String keyword) {
        Document document = Jsoup.parse(html, pageUrl);
        Map<String, SearchHit> results = new LinkedHashMap<>();
        String normalizedKeyword = normalize(keyword);
        for (Element link : document.select("a[href*='/p/'],a[href*='/v/']")) {
            URI href;
            try { href = URI.create(link.absUrl("href")); } catch (Exception ignored) { continue; }
            if (!allowedDetail(href)) continue;
            Element item = link;
            for (int depth = 0; depth < 4 && item.parent() != null; depth++) {
                item = item.parent();
                if (item.selectFirst("img[src],img[data-original],img[data-src],img[data-lazy-src]") != null || item.text().length() > 20) break;
            }
            Element heading = item.selectFirst("h1,h2,h3,.title,.vodname,.module-card-item-title");
            String title = firstNonBlank(link.attr("title"), heading == null ? "" : heading.text(), link.text()).trim();
            if (title.isEmpty() || !normalize(title).contains(normalizedKeyword)) continue;
            Element image = item.selectFirst("img[data-original],img[data-src],img[data-lazy-src],img[src]");
            String cover = image == null ? "" : firstNonBlank(image.attr("abs:data-original"), image.attr("abs:data-src"), image.attr("abs:data-lazy-src"), image.attr("abs:src"));
            // Cover hosts are distinct from source hosts; never broaden HTML fetch permissions.
            try { if (!allowedCover(URI.create(cover))) cover = ""; } catch (Exception ignored) { cover = ""; }
            SearchHit hit = new SearchHit(trim(title, 120), href.toString(), cover,
                trim(item.text().replace(title, "").replaceAll("\\s+", " ").trim(), 180));
            String key = normalize(title);
            SearchHit previous = results.get(key);
            // On the PC search host /v/<id>/<line> is the detail page;
            // /p/<id>/<line>/<episode> is the playback page.
            if (previous == null || (href.getPath().startsWith("/v/") && previous.sourceUrl().contains("/p/"))) {
                results.put(key, previous != null && cover.isEmpty()
                    ? new SearchHit(hit.title(), hit.sourceUrl(), previous.coverUrl(), hit.summary()) : hit);
            } else if (previous.coverUrl().isEmpty() && !cover.isEmpty()) {
                results.put(key, new SearchHit(previous.title(), previous.sourceUrl(), cover, previous.summary()));
            }
            if (results.size() >= 30) break;
        }
        List<SearchHit> ordered = new ArrayList<>(results.values());
        ordered.sort((left, right) -> {
            String leftKey = normalize(left.title());
            String rightKey = normalize(right.title());
            boolean leftExact = leftKey.equals(normalizedKeyword);
            boolean rightExact = rightKey.equals(normalizedKeyword);
            if (leftExact != rightExact) return leftExact ? -1 : 1;
            boolean leftPrefix = leftKey.startsWith(normalizedKeyword);
            boolean rightPrefix = rightKey.startsWith(normalizedKeyword);
            if (leftPrefix != rightPrefix) return leftPrefix ? -1 : 1;
            return 0;
        });
        return List.copyOf(ordered);
    }

    static SourcePreview parsePreview(String html, String sourceUrl) {
        Document document = Jsoup.parse(html, sourceUrl);
        Element heading = document.selectFirst("h1,.module-info-heading,.video-info-header h1,h2");
        String title = heading == null ? trim(document.title(), 120) : trim(heading.text(), 120);
        // 标题缺失不再让整次预览失败（VQ-60）：页面改版只剩播放器配置时，以前整页不可预览，
        // 连首集探测也一起失败。标题降级为空串，由客户端用搜索命中或已保存作品的标题补上。
        if (title.isBlank()) title = "";
        Element image = document.selectFirst(".video_img img[src],.module-info-poster img[data-original],.module-info-poster img[src],.module-item-cover img[data-original],.module-item-cover img[data-src],.module-item-cover img[src],meta[property=og:image]");
        String cover = image == null ? "" : firstNonBlank(image.attr("abs:data-original"), image.attr("abs:data-src"), image.attr("abs:src"), image.attr("abs:content"));
        try { if (!allowedCover(URI.create(cover))) cover = ""; } catch (Exception ignored) { cover = ""; }
        Element description = document.selectFirst("meta[name=description],meta[property=og:description]");
        String summary = description == null ? "" : trim(description.attr("content").trim(), 500);
        List<PreviewEpisode> current = new ArrayList<>();
        for (Element script : document.select("script")) {
            Matcher config = PLAYER_CONFIG.matcher(script.data().isEmpty() ? script.html() : script.data());
            if (!config.find()) continue;
            Matcher media = PLAYER_URL.matcher(config.group(1));
            if (!media.find()) continue;
            String candidate = decodeJavaScriptEscapes(media.group(2).replace("\\/", "/").replace("&amp;", "&").trim());
            try {
                URI playback = resolvePlayback(sourceUrl, candidate);
                if (!"https".equalsIgnoreCase(playback.getScheme()) || playback.getHost() == null || playback.getUserInfo() != null) continue;
                String resource = (playback.getPath() == null ? "" : playback.getPath()) + (playback.getQuery() == null ? "" : "?" + playback.getQuery());
                String mime = resource.matches("(?i).*\\.m3u8(?:$|[^\\w]).*") || resource.matches("(?i).*[?&](?:format|type)=(?:hls|m3u8)(?:&|$).*")
                    ? "application/vnd.apple.mpegurl" : resource.matches("(?i).*\\.mp4(?:$|[^\\w]).*") ? "video/mp4" : "";
                // 来源常用不带后缀的 CDN 路由地址；校验不再要求后缀像媒体，交给播放器决定成败。
                current.add(new PreviewEpisode(sourceUrl, "当前播放页", sourceUrl, playback.toString(), mime, "main"));
                break;
            } catch (Exception ignored) { /* Try the next public player config. */ }
        }
        if (current.isEmpty()) current.addAll(parseLines(document, sourceUrl));
        Map<String, PreviewEpisode> episodes = new LinkedHashMap<>();
        List<Element> playlistLinks = document.select(".module-play-list a[href]");
        // The PC detail page has a separate panel for each source; both panels
        // may reuse the same DOM id, so pair panels and source labels by order.
        List<Element> panels = document.select(".module-list:has(.module-play-list)");
        List<Element> sourceTabs = lineTabs(document);
        // The PC bundled source uses bare /p detail pages with /v episode links,
        // but does not wrap its playlist in .module-play-list.
        if (playlistLinks.isEmpty()) playlistLinks = document.select("a[href]");
        for (Element link : playlistLinks) {
            String href = link.absUrl("href");
            try {
                URI uri = URI.create(href);
                if (!allowedDetail(uri) || !sameWork(URI.create(sourceUrl), uri)) continue;
                String label = firstNonBlank(link.attr("title"), link.text()).trim();
                if (label.isBlank()) continue;
                // Only actual playlist entries can become episodes; generic navigation and same-work recommendations are not selectable.
                if (!link.hasAttr("onclick") && link.closest(".module-play-list,.play-list,.play_list,.playlist,.video_list") == null
                    && !label.matches("(?i).*(?:第\\s*\\d+\\s*[集话]|(?:EP|E)\\s*\\d+|国语|中字|正片|播放).*")) continue;
                String lineId = "main";
                Element panel = link.closest(".module-list");
                int panelIndex = panels.indexOf(panel);
                // 面板里的选集一律带上线路名：客户端靠它把同一部作品的多条线路分开成各自的选集列表。
                if (panelIndex >= 0) lineId = panelLineName(panel, panelIndex < sourceTabs.size() ? sourceTabs.get(panelIndex) : null, panelIndex);
                episodes.putIfAbsent(href, new PreviewEpisode(href, trim(label, 80), href, "", "", lineId));
                if (episodes.size() >= 1000) break;
            } catch (Exception ignored) { /* Only a validated page may become an episode. */ }
        }
        if (episodes.isEmpty()) {
            for (PreviewEpisode option : current) episodes.put(option.sourceUrl() + "#" + option.lineId(), option);
        } else {
            // temLineList 的编号与选集链接末段编号是同一套身份（详情页与播放页都一样），
            // 因此按编号把公开线路对齐到它描述的那个选集：既能一次拿到可播地址，
            // 也不会像按写入顺序覆盖那样把上一个条目的标题配到下一个条目的地址上
            //（《你的名字》就出现过「HD国语」显示成中字地址的串线）。
            Map<String, String> keyByIdentity = new LinkedHashMap<>();
            for (Map.Entry<String, PreviewEpisode> entry : episodes.entrySet()) {
                String identity = pageIdentity(entry.getKey());
                if (!identity.isEmpty()) keyByIdentity.putIfAbsent(identity, entry.getKey());
            }
            PreviewEpisode pageEntry = episodes.get(sourceUrl);
            for (PreviewEpisode option : current) {
                if (option.playbackUrl().isEmpty()) continue;
                // Episode-named temLineList entries describe the selected episode,
                // not a second playback source for that same episode.
                boolean episodeNamedOption = episodeNamed(option.title());
                String matchedKey = keyByIdentity.get(option.lineId());
                PreviewEpisode matched = matchedKey == null ? null : episodes.get(matchedKey);
                if (matched != null) {
                    // 线路名（面板名）优先保留：它同时是客户端分线路与历史续播的依据，
                    // 不能被 temLineList 的条目编号顶掉（否则多条线路又会并成一条）。
                    String panelLine = matched.lineId() == null ? "" : matched.lineId();
                    String lineForEntry = panelLine.isBlank() || "main".equals(panelLine) ? option.lineId() : panelLine;
                    episodes.put(matchedKey, new PreviewEpisode(matched.id(), matched.title(), matched.sourceUrl(), option.playbackUrl(),
                        option.mimeType(), lineForEntry));
                    continue;
                }
                if (pageEntry == null) continue;
                if (!"main".equals(option.lineId()) && !episodeNamedOption)
                    episodes.put(sourceUrl + "#" + option.lineId(), new PreviewEpisode(sourceUrl, pageEntry.title() + " · " + option.title(),
                        sourceUrl, option.playbackUrl(), option.mimeType(), option.lineId()));
            }
        }
        return new SourcePreview(title, sourceUrl, cover, summary, List.copyOf(episodes.values()));
    }

    /**
     * 选集地址里代表“这一条”的编号：`/v/<作品>-<线路>-<集>` 取集号，`/p/<作品>/<线路>/<集>` 取末段。
     * 与 temLineList 的 `id` 是同一套编号，用于把公开线路对齐到对应选集。
     */
    private static String pageIdentity(String url) {
        try {
            String path = URI.create(url).getPath().replaceAll("/$", "");
            String[] segments = path.split("/");
            if (segments.length < 3) return "";
            String last = segments[segments.length - 1];
            if (!"v".equals(segments[1])) return last;
            return last.substring(last.lastIndexOf('-') + 1);
        } catch (Exception ignored) {
            return "";
        }
    }

    private static boolean sameWork(URI root, URI page) {
        if (!root.getHost().equalsIgnoreCase(page.getHost())) return false;
        String[] left = root.getPath().split("/");
        String[] right = page.getPath().split("/");
        if (left.length < 3 || right.length < 3) return false;
        String leftId = "v".equals(left[1]) ? left[2].split("-")[0] : left[2];
        String rightId = "v".equals(right[1]) ? right[2].split("-")[0] : right[2];
        return leftId.equals(rightId) && (("p".equals(left[1]) || "v".equals(left[1]))
            && ("p".equals(right[1]) || "v".equals(right[1])));
    }

    private static List<PreviewEpisode> parseLines(Document document, String sourceUrl) {
        List<PreviewEpisode> lines = new ArrayList<>();
        for (Element script : document.select("script")) {
            String source = script.data().isEmpty() ? script.html() : script.data();
            int start = source.indexOf("temLineList");
            if (start < 0) continue;
            int assignment = source.indexOf('=', start + "temLineList".length());
            if (assignment < 0) continue;
            int bracket = source.indexOf('[', assignment);
            if (bracket < 0) continue;
            try {
                JsonElement parsed = JsonParser.parseString(assignedArray(source, bracket));
                if (!parsed.isJsonArray()) continue;
                int index = 0;
                for (JsonElement entry : parsed.getAsJsonArray()) {
                    if (++index > 1000) break;
                    if (!entry.isJsonObject()) continue;
                    JsonObject object = entry.getAsJsonObject();
                    String encoded = stringField(object, "file");
                    if (encoded.length() < 4) continue;
                    String decoded = URLDecoder.decode(new String(Base64.getDecoder().decode(encoded.substring(3)), StandardCharsets.UTF_8), StandardCharsets.UTF_8.name());
                    URI uri = resolvePlayback(sourceUrl, decoded);
                    String resource = (uri.getPath() == null ? "" : uri.getPath()) + (uri.getQuery() == null ? "" : "?" + uri.getQuery());
                    if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) continue;
                    String mime = resource.matches("(?i).*\\.m3u8(?:$|[^\\w]).*") || resource.matches("(?i).*[?&](?:format|type)=(?:hls|m3u8)(?:&|$).*")
                        ? "application/vnd.apple.mpegurl" : resource.matches("(?i).*\\.mp4(?:$|[^\\w]).*") ? "video/mp4" : "";
                    String label = firstNonBlank(stringField(object, "name"), stringField(object, "subTitle"), "线路 " + index);
                    String id = firstNonBlank(stringField(object, "id"), String.valueOf(index));
                    if (lines.stream().noneMatch(line -> line.playbackUrl().equals(decoded))) lines.add(new PreviewEpisode(sourceUrl, trim(label, 80), sourceUrl, decoded, mime, id));
                }
            } catch (Exception ignored) { /* Malformed optional lines cannot enable arbitrary requests. */ }
        }
        if (lines.size() > 1 && lines.stream().allMatch(line -> episodeNamed(line.title()))) {
            String path = URI.create(sourceUrl).getPath().replaceAll("/$", "");
            String[] segments = path.split("/");
            String selected = segments[segments.length - 1];
            if ("v".equals(segments[1])) selected = selected.substring(selected.lastIndexOf('-') + 1);
            final String currentId = selected;
            List<PreviewEpisode> preferred = lines.stream().filter(line -> line.lineId().equals(currentId)).collect(java.util.stream.Collectors.toList());
            // 搜索结果经常使用 /p/.../0 作为占位播放页，真实 temLineList 的
            // episode id 不一定等于 URL 末段。匹配不到时必须保留完整线路，
            // 由上层按集名/线路选择可播放地址，不能把整个播放清单过滤为空。
            return preferred.isEmpty() ? lines : preferred;
        }
        return lines;
    }

    private static URI resolvePlayback(String sourceUrl, String candidate) {
        URI base = URI.create(sourceUrl);
        URI parsed = URI.create(candidate.trim());
        return parsed.isAbsolute() ? parsed : base.resolve(parsed);
    }

    /** 页面脚本里的媒体路径可能使用 JSON/JavaScript Unicode 转义，PC 执行脚本会自动还原。 */
    private static String decodeJavaScriptEscapes(String value) {
        Matcher unicode = Pattern.compile("\\\\u([0-9a-fA-F]{4})").matcher(value);
        StringBuffer result = new StringBuffer();
        while (unicode.find()) {
            unicode.appendReplacement(result,
                Matcher.quoteReplacement(String.valueOf((char) Integer.parseInt(unicode.group(1), 16))));
        }
        unicode.appendTail(result);

        Matcher hex = Pattern.compile("\\\\x([0-9a-fA-F]{2})").matcher(result.toString());
        StringBuffer decoded = new StringBuffer();
        while (hex.find()) {
            hex.appendReplacement(decoded,
                Matcher.quoteReplacement(String.valueOf((char) Integer.parseInt(hex.group(1), 16))));
        }
        hex.appendTail(decoded);
        return decoded.toString();
    }

    private static boolean episodeNamed(String label) {
        return label.matches("(?i).*(?:第\\s*\\d+\\s*[集话]|(?:EP|E)\\s*\\d+).*");
    }

    /**
     * 线路页签。站点当前把线路名写在 `#playSwiper .module-tab-item` 的文本里（例如「加速云」「火箭云」），
     * 旧模板用 `#y-playList`；两者都取不到时退回任意 `.module-tab-item`，避免整站换模板后线路名丢失。
     */
    private static List<Element> lineTabs(Document document) {
        for (String selector : new String[]{"#playSwiper .module-tab-item", ".module-tab-items .module-tab-item",
            "#y-playList .module-tab-item", ".module-tab-item"}) {
            List<Element> tabs = document.select(selector);
            if (!tabs.isEmpty()) return tabs;
        }
        return List.of();
    }

    /**
     * 面板对应的线路名：页签 `data-dropdown-value` → 页签内 `span` → 页签文本 → 面板自身标签 → 「线路 N」。
     * 线路名是客户端区分线路的唯一依据：同一部作品的多条线路共用同一个 URL 线路段
     * （实测三条线路的选集地址都是 `/p/210580/153/<条目id>`），按地址分组会把它们并成一条。
     */
    private static String panelLineName(Element panel, Element tab, int index) {
        String name = tab == null ? "" : firstNonBlank(tab.attr("data-dropdown-value"),
            tab.selectFirst("span") == null ? "" : tab.selectFirst("span").text(), tab.text()).trim();
        if (name.isBlank() && panel != null) {
            Element label = panel.selectFirst("video,.module-tab-value,.module-play-list-title");
            if (label != null) name = label.text().trim();
        }
        return trim(firstNonBlank(name, "线路 " + (index + 1)), 80);
    }

    private static String stringField(JsonObject object, String name) {
        JsonElement value = object.get(name);
        return value == null || value.isJsonNull() || !value.isJsonPrimitive() ? "" : value.getAsString().trim();
    }

    private static String assignedArray(String source, int start) {
        int depth = 0;
        char quote = 0;
        boolean escape = false;
        for (int i = start; i < source.length(); i++) {
            char value = source.charAt(i);
            if (quote != 0) {
                if (escape) escape = false;
                else if (value == '\\') escape = true;
                else if (value == quote) quote = 0;
            } else if (value == '"' || value == '\'') quote = value;
            else if (value == '[') depth++;
            else if (value == ']' && --depth == 0) return source.substring(start, i + 1);
        }
        return "";
    }

    static boolean allowedDetail(URI uri) {
        // 只保证“白名单站点 + /p/ 或 /v/ 路径 + 不带查询串”，不再限制路径层级，
        // 否则站点调整路径层级（多一段、少一段）就会把整部作品判成不可预览。
        return allowedHost(uri) && uri.getRawQuery() == null && uri.getFragment() == null
            && (uri.getPath().startsWith("/p/") || uri.getPath().startsWith("/v/"));
    }

    static boolean allowedHost(URI uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null ||
            (uri.getPort() != -1 && uri.getPort() != 443)) return false;
        String host = uri.getHost();
        return "yhdmtv.cc".equalsIgnoreCase(host) || "www.yhdmtv.cc".equalsIgnoreCase(host)
            || "yinghuadongman.org.cn".equalsIgnoreCase(host) || "www.yinghuadongman.org.cn".equalsIgnoreCase(host);
    }

    static boolean allowedCover(URI uri) {
        if (allowedHost(uri)) return true;
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null
            || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawQuery() != null) return false;
        String host = uri.getHost();
        return host != null && ("img.picbf.com".equalsIgnoreCase(host) || "snzypic.vip".equalsIgnoreCase(host)
            || "www.mdzywtupian.com".equalsIgnoreCase(host)
            || "pic.wujinimg.com".equalsIgnoreCase(host) || "img.lzzyimg.com".equalsIgnoreCase(host)
            || "s4.anilist.co".equalsIgnoreCase(host));
    }

    private static String fetch(URI start, long deadline) throws Exception {
        URI current = start;
        for (int redirects = 0; redirects <= 3; redirects++) {
            if (!allowedHost(current) || System.nanoTime() >= deadline) throw new IllegalArgumentException("来源无效");
            HttpURLConnection connection = (HttpURLConnection) current.toURL().openConnection();
            // 只有完整读完并原样返回时才把连接交回 JDK 的 keep-alive 池：同主机下一次请求
            // 可以省掉一次 TCP/TLS 握手，跳转和中途失败仍然立刻断开，避免留下半读连接。
            boolean reusable = false;
            try {
                connection.setInstanceFollowRedirects(false);
                int timeout = (int) Math.min(REQUEST_TIMEOUT_MILLIS, Math.max(1, (deadline - System.nanoTime()) / 1_000_000));
                connection.setConnectTimeout(timeout);
                connection.setReadTimeout(timeout);
                connection.setRequestProperty("Accept", "text/html,application/xhtml+xml");
                // 来源页面都是文本 HTML：请求压缩传输可以明显减少等待；服务端不压缩时按原文读取。
                connection.setRequestProperty("Accept-Encoding", "gzip");
                connection.setRequestProperty("User-Agent", "sanye_anime-android-source/1.0");
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IllegalArgumentException("来源跳转无效");
                    URI next = current.resolve(location);
                    if (!allowedHost(next)) throw new IllegalArgumentException("来源跳转越界");
                    current = next;
                    continue;
                }
                if (status != 200 || System.nanoTime() >= deadline) throw new IllegalArgumentException("来源未响应");
                String contentType = connection.getContentType();
                if (contentType == null || !(contentType.toLowerCase(Locale.ROOT).contains("text/html") || contentType.toLowerCase(Locale.ROOT).contains("application/xhtml+xml"))) throw new IllegalArgumentException("来源内容类型无效");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream raw = connection.getInputStream();
                     InputStream input = gzipEncoded(connection) ? new GZIPInputStream(raw) : raw) {
                    byte[] buffer = new byte[8192];
                    for (int count; (count = input.read(buffer)) != -1;) {
                        if (bytes.size() + count > MAX_HTML_BYTES || System.nanoTime() >= deadline) throw new IllegalArgumentException("来源过大或超时");
                        bytes.write(buffer, 0, count);
                    }
                }
                reusable = true;
                return decodeHtml(bytes.toByteArray(), contentType);
            } finally {
                if (!reusable) connection.disconnect();
            }
        }
        throw new IllegalArgumentException("来源跳转次数过多");
    }

    private static boolean gzipEncoded(HttpURLConnection connection) {
        String encoding = connection.getContentEncoding();
        return encoding != null && encoding.toLowerCase(Locale.ROOT).contains("gzip");
    }

    private static final Pattern CHARSET_PARAM = Pattern.compile("charset\\s*=\\s*[\"']?([A-Za-z0-9_\\-]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern META_CHARSET = Pattern.compile(
        "<meta[^>]+charset\\s*=\\s*[\"']?([A-Za-z0-9_\\-]+)|<meta[^>]+content\\s*=\\s*[\"'][^\"']*charset\\s*=\\s*([A-Za-z0-9_\\-]+)",
        Pattern.CASE_INSENSITIVE);
    /** meta 只会出现在文档头部：只嗅探前 4KB，不对整页做正则扫描。 */
    private static final int META_SNIFF_BYTES = 4096;

    /**
     * 按页面自己声明的字符集解码（VQ-62）：以前固定按 UTF-8 解码、完全不看
     * `Content-Type: charset` 与 `<meta charset>`。来源站一旦返回 GBK/GB2312，
     * 中文标题会整片乱码，解析出来的命中又会因为 normalize 对不上而全部落空。
     * 顺序：HTTP 头 charset → HTML 里的 meta charset → UTF-8（保持原有回落行为）。
     */
    static String decodeHtml(byte[] body, String contentType) {
        Charset charset = charsetFromContentType(contentType);
        if (charset == null) charset = charsetFromMeta(body);
        if (charset == null) charset = StandardCharsets.UTF_8;
        return new String(body, charset);
    }

    private static Charset charsetFromContentType(String contentType) {
        if (contentType == null) return null;
        Matcher matcher = CHARSET_PARAM.matcher(contentType);
        return matcher.find() ? safeCharset(matcher.group(1)) : null;
    }

    private static Charset charsetFromMeta(byte[] body) {
        int limit = Math.min(body.length, META_SNIFF_BYTES);
        // 头部按单字节编码读，保证 meta 里的 ASCII 声明原样可见。
        String head = new String(body, 0, limit, StandardCharsets.ISO_8859_1);
        Matcher matcher = META_CHARSET.matcher(head);
        if (!matcher.find()) return null;
        return safeCharset(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
    }

    private static Charset safeCharset(String name) {
        if (name == null || name.isBlank()) return null;
        try {
            return Charset.forName(name.trim().replace("\"", "").replace("'", ""));
        } catch (Exception unsupported) {
            return null;
        }
    }

    private static String normalize(String input) {
        return Normalizer.normalize(input, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[\\p{P}\\p{S}\\s]+", "");
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "";
    }

    private static String trim(String input, int length) {
        return input.length() > length ? input.substring(0, length) : input;
    }
}
