package com.sanye.sanye_anime;

import com.google.gson.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import org.jsoup.parser.Parser;
import org.jsoup.select.Elements;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.function.Consumer;

/** Animeko 声明式规则的静态子集。不执行脚本或订阅中的正则。 */
final class SubscriptionSourceEngine {
    interface Fetcher { String fetch(String url) throws Exception; }
    private final Fetcher fetch;
    private final SubscriptionFetchPolicy.Resolver resolver;
    private static final Semaphore NETWORK = new Semaphore(4, true);
    private static final Pattern MEDIA = Pattern.compile("https://[^\\s\"'<>\\\\]+?\\.(?:m3u8|mp4|webm)(?:\\?[^\\s\"'<>\\\\]*)?", Pattern.CASE_INSENSITIVE);
    private static final ExecutorService DNS = new ThreadPoolExecutor(0, 4, 30, TimeUnit.SECONDS,
            new SynchronousQueue<>(), task -> { Thread thread = new Thread(task, "sanye-source-dns"); thread.setDaemon(true); return thread; });
    SubscriptionSourceEngine() { this(SubscriptionPageFetchPolicy::fetch); }
    SubscriptionSourceEngine(Fetcher fetch) { this(fetch, java.net.InetAddress::getAllByName); }
    SubscriptionSourceEngine(Fetcher fetch, SubscriptionFetchPolicy.Resolver resolver) { this.fetch = fetch; this.resolver = resolver; }
    private String read(String url) throws Exception {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
        SubscriptionFetchPolicy.validateUrl(url);
        if (!NETWORK.tryAcquire(8, TimeUnit.SECONDS)) throw new IllegalArgumentException("订阅请求繁忙，请稍后重试");
        try {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
            String result = fetch.fetch(url);
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
            return result;
        } finally { NETWORK.release(); }
    }
    private static String str(JsonObject o, String key) { return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : ""; }
    private static JsonObject obj(JsonObject o, String key) { return o.has(key) && o.get(key).isJsonObject() ? o.getAsJsonObject(key) : new JsonObject(); }
    private static JsonArray sourceList(String content) {
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > SubscriptionFetchPolicy.MAX_BYTES) throw new IllegalArgumentException("订阅超过 2 MB");
        JsonArray list = JsonParser.parseString(content).getAsJsonObject().getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        if (list == null || list.isEmpty() || list.size() > 100) throw new IllegalArgumentException("订阅需包含 1 至 100 个来源");
        return list;
    }
    private static boolean supported(JsonObject rule) {
        JsonObject config = obj(obj(rule, "arguments"), "searchConfig");
        return str(rule, "factoryId").equals("rss") && str(rule, "version").equals("1")
                || str(rule, "factoryId").equals("web-selector") && str(rule, "version").equals("2")
                && Set.of("a", "indexed").contains(str(config, "subjectFormatId"))
                && Set.of("index-grouped", "no-channel").contains(str(config, "channelFormatId"));
    }
    private static List<JsonObject> rules(String content) {
        JsonArray list = sourceList(content);
        List<JsonObject> result = new ArrayList<>();
        for (int sourceIndex = 0; sourceIndex < list.size(); sourceIndex++) {
            JsonElement e = list.get(sourceIndex);
            JsonObject rule = e.getAsJsonObject();
            if (supported(rule)) {
                // 保留原始 mediaSources 数组位置，即使前面的规则不受支持。
                rule.addProperty("_sourceIndex", sourceIndex);
                result.add(rule);
            }
        }
        if (result.isEmpty()) throw new IllegalArgumentException("订阅没有受支持来源（仅 CSS a/indexed、index-grouped/no-channel 或 RSS；不支持 JSONPath）");
        return result;
    }
    private static Elements select(Element element, String selector) {
        if (selector.isBlank()) return new Elements();
        if (selector.length() > 512) throw new IllegalArgumentException("CSS 选择器过长");
        Elements selected = element.select(selector);
        if (selected.size() > 500) return new Elements(selected.subList(0, 500));
        return selected;
    }
    private static String link(Element e, String attr) {
        String value = e.absUrl(attr);
        try { return SubscriptionFetchPolicy.validateUrl(value).toString(); } catch (Exception ignored) { return ""; }
    }
    private static JsonObject entry(String title, String url, String name) {
        JsonObject out = new JsonObject(); out.addProperty("title", title); out.addProperty("sourceUrl", url);
        out.addProperty("coverUrl", ""); out.addProperty("summary", ""); out.addProperty("sourceName", name); return out;
    }
    JsonObject search(String content, String keyword) throws Exception {
        return search(content, keyword, ignored -> {});
    }
    JsonObject search(String content, String keyword, Consumer<JsonObject> progress) throws Exception {
        return search(content, keyword, progress, System.nanoTime() + TimeUnit.SECONDS.toNanos(10), 4);
    }
    JsonObject search(String content, String keyword, Consumer<JsonObject> progress, long deadline, int concurrency) throws Exception {
        return search(content, keyword, null, progress, deadline, concurrency);
    }
    JsonObject search(String content, String keyword, Integer sourceIndex, Consumer<JsonObject> progress, long deadline, int concurrency) throws Exception {
        if (keyword == null || keyword.isBlank() || keyword.codePointCount(0, keyword.length()) > 50) throw new IllegalArgumentException("请输入 1–50 字搜索词");
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
        if (System.nanoTime() >= deadline) throw new TimeoutException("搜索超过整体期限");
        List<JsonObject> sources = rules(content);
        if (sourceIndex != null) {
            sources = sources.stream().filter(source -> source.get("_sourceIndex").getAsInt() == sourceIndex).collect(java.util.stream.Collectors.toList());
            if (sources.isEmpty()) throw new IllegalArgumentException("来源索引无效或规则不受支持");
        }
        ExecutorService pool = Executors.newFixedThreadPool(Math.max(1, Math.min(4, concurrency)), task -> {
            Thread thread = new Thread(task, "sanye-subscription-search"); thread.setDaemon(true); return thread;
        });
        CompletionService<JsonArray> done = new ExecutorCompletionService<>(pool);
        List<Future<JsonArray>> tasks = new ArrayList<>();
        JsonArray hits = new JsonArray(), warnings = new JsonArray(); int successes = 0, completed = 0;
        Set<String> seen = new HashSet<>();
        try {
            for (JsonObject source : sources) tasks.add(done.submit(() -> {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
                if (System.nanoTime() >= deadline) throw new TimeoutException("搜索超过整体期限");
                long started = System.nanoTime();
                JsonArray found = searchOne(source, keyword);
                long responseMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
                for (JsonElement hit : found) hit.getAsJsonObject().addProperty("responseMs", responseMs);
                return found;
            }));
            for (int i = 0; i < sources.size(); i++) {
                long left = deadline - System.nanoTime(); if (left <= 0) break;
                Future<JsonArray> task = done.poll(left, TimeUnit.NANOSECONDS); if (task == null) break;
                try { JsonArray found = task.get(); successes++; for (JsonElement hit : found) {
                    JsonObject item = hit.getAsJsonObject();
                    String key = str(item, "sourceUrl") + "\u0000" + str(item, "resourceUrl") + "\u0000" + str(item, "sourceIndex");
                    if (hits.size() < 200 && seen.add(key)) hits.add(hit);
                } }
                catch (Exception failure) { warnings.add("部分来源不可用或规则不受支持"); }
                completed++;
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException("搜索已取消");
                progress.accept(searchResult(hits.deepCopy(), warnings.deepCopy(), completed, sources.size()));
            }
        } catch (InterruptedException cancelled) {
            Thread.currentThread().interrupt();
            throw cancelled;
        } finally { for (Future<?> task : tasks) task.cancel(true); pool.shutdownNow(); }
        if (successes == 0) throw new IllegalArgumentException("订阅来源搜索失败或超时，请检查网络；不支持脚本、验证码和 JSONPath");
        if (completed < sources.size()) warnings.add("部分来源搜索超时，已保留返回结果");
        return searchResult(hits, warnings, completed, sources.size());
    }
    private static JsonObject searchResult(JsonArray hits, JsonArray warnings, int completed, int total) {
        JsonObject out = new JsonObject(); out.add("hits", hits); out.add("warnings", warnings);
        out.addProperty("completed", completed); out.addProperty("total", total); return out;
    }
    private JsonArray searchOne(JsonObject source, String keyword) throws Exception {
        JsonObject args = obj(source, "arguments"), config = obj(args, "searchConfig");
        String query = keyword.trim();
        if (str(config, "searchUseOnlyFirstWord").equals("true")) query = query.split("\\s+")[0];
        if (str(config, "searchRemoveSpecial").equals("true")) query = query.replaceAll("[^\\p{L}\\p{N}\\s]", "");
        String url = str(config, "searchUrl").replace("{keyword}", URLEncoder.encode(query, StandardCharsets.UTF_8.name()));
        String html = read(url), name = str(args, "name"); JsonArray hits = new JsonArray();
        if (str(source, "factoryId").equals("rss")) {
            Document xml = Jsoup.parse(html, url, Parser.xmlParser());
            for (Element item : select(xml, "item")) {
                String resource = item.select("enclosure").attr("url"), page = item.select("link").text().trim();
                if (resource.isBlank()) resource = page;
                if (!resource.startsWith("magnet:?") && !resource.startsWith("https://")) continue;
                JsonObject hit = entry(item.select("title").text(), page.isBlank() ? resource : page, name);
                hit.addProperty("sourceIndex", source.get("_sourceIndex").getAsInt());
                hit.addProperty("kind", "resource"); hit.addProperty("resourceUrl", resource); hits.add(hit);
                if (hits.size() >= 100) break;
            }
            return hits;
        }
        Document doc = Jsoup.parse(html, str(config, "rawBaseUrl").isBlank() ? url : str(config, "rawBaseUrl"));
        return parseWebHits(source, config, doc);
    }
    private static JsonArray parseWebHits(JsonObject source, JsonObject config, Document doc) {
        JsonArray hits = new JsonArray();
        String name = str(obj(source, "arguments"), "name");
        boolean indexed = str(config, "subjectFormatId").equals("indexed");
        JsonObject selector = obj(config, indexed ? "selectorSubjectFormatIndexed" : "selectorSubjectFormatA");
        Elements links = select(doc, str(selector, indexed ? "selectLinks" : "selectLists"));
        Elements names = indexed ? select(doc, str(selector, "selectNames")) : links;
        if (indexed && names.size() != links.size()) throw new IllegalArgumentException("搜索名称与地址数量不匹配");
        for (int i = 0; i < links.size() && hits.size() < 100; i++) {
            String address = link(links.get(i), "href"), title = names.get(i).text();
            if (!address.isBlank() && !title.isBlank()) {
                JsonObject hit = entry(title, address, name); hit.addProperty("kind", "web");
                hit.addProperty("sourceIndex", source.get("_sourceIndex").getAsInt());
                Element card = links.get(i);
                for (int depth = 0; card != null && depth < 8; depth++, card = card.parent()) {
                    Set<String> addresses = new HashSet<>();
                    for (Element candidate : links) {
                        if (candidate != card && !candidate.parents().contains(card)) continue;
                        String target = link(candidate, "href");
                        if (!target.isBlank()) addresses.add(target);
                    }
                    if (addresses.size() > 1) break;
                    Elements images = card.select("img, a[data-original], a[data-src]");
                    if (images.size() > 1) break;
                    if (images.size() == 1) {
                        String image = imageUrl(images.first());
                        if (!image.isBlank()) { hit.addProperty("coverUrl", image); break; }
                    }
                }
                hits.add(hit);
            }
        }
        return hits;
    }
    private static JsonObject repositoryConfig(JsonObject source) throws java.io.IOException {
        JsonObject config = obj(obj(source, "arguments"), "repositoryConfig");
        if (config.size() == 0) throw new IllegalArgumentException("来源未声明目录，当前仅提供搜索候选");
        if (!supported(source) || !str(source, "factoryId").equals("web-selector")) throw new IllegalArgumentException("目录仅支持静态网页 CSS 规则，不支持脚本、RSS 或 DRM");
        if (!str(config, "version").equals("1") || !Set.of("a", "indexed").contains(str(config, "subjectFormatId"))) throw new IllegalArgumentException("目录规则仅支持 version 1 与 CSS a/indexed");
        String url = str(config, "url");
        String expanded = url.replace("{page}", "1");
        try { SubscriptionFetchPolicy.validateUrl(expanded); } catch (java.io.IOException invalid) { throw new IllegalArgumentException(invalid.getMessage(), invalid); }
        if (expanded.contains("{") || expanded.contains("}")) throw new IllegalArgumentException("目录地址包含未知占位符");
        JsonObject search = obj(obj(source, "arguments"), "searchConfig");
        URI base;
        URI target;
        try {
            base = SubscriptionFetchPolicy.validateUrl(str(search, "searchUrl").replace("{keyword}", "test"));
            target = SubscriptionFetchPolicy.validateUrl(expanded);
        } catch (java.io.IOException invalid) { throw new IllegalArgumentException(invalid.getMessage(), invalid); }
        String raw = str(search, "rawBaseUrl");
        if (!target.getHost().equalsIgnoreCase(base.getHost())) {
            if (raw.isBlank()) throw new IllegalArgumentException("目录地址不属于该来源");
            try { if (!target.getHost().equalsIgnoreCase(SubscriptionFetchPolicy.validateUrl(raw).getHost())) throw new IllegalArgumentException("目录地址不属于该来源"); }
            catch (java.io.IOException invalid) { throw new IllegalArgumentException(invalid.getMessage(), invalid); }
        }
        boolean paginated = url.contains("{page}");
        String next = str(config, "selectNextPage");
        if (paginated != !next.isBlank()) throw new IllegalArgumentException("分页目录必须同时声明 {page} 与 selectNextPage");
        boolean indexed = str(config, "subjectFormatId").equals("indexed");
        JsonObject selector = obj(config, indexed ? "selectorSubjectFormatIndexed" : "selectorSubjectFormatA");
        String links = str(selector, indexed ? "selectLinks" : "selectLists");
        if (links.isBlank() || indexed && str(selector, "selectNames").isBlank()) throw new IllegalArgumentException("目录缺少作品选择器");
        Document empty = Jsoup.parse("");
        select(empty, links);
        if (indexed) select(empty, str(selector, "selectNames"));
        if (paginated) select(empty, next);
        return config;
    }
    JsonObject capabilities(String content) {
        JsonArray sources = new JsonArray(), list = sourceList(content);
        for (int index = 0; index < list.size(); index++) {
            JsonObject source = list.get(index).getAsJsonObject(), capability = new JsonObject();
            capability.addProperty("sourceIndex", index);
            capability.addProperty("name", str(obj(source, "arguments"), "name"));
            capability.addProperty("search", supported(source));
            capability.addProperty("playback", supported(source) && str(source, "factoryId").equals("web-selector") ? "static-only" : "unsupported");
            capability.addProperty("repository", false); capability.addProperty("pagination", false);
            try {
                JsonObject config = repositoryConfig(source);
                capability.addProperty("repository", true);
                capability.addProperty("pagination", str(config, "url").contains("{page}"));
                capability.addProperty("reason", "仅声明式静态 HTML；不执行脚本、验证码或 DRM");
            } catch (IllegalArgumentException | java.io.IOException failure) { capability.addProperty("reason", failure.getMessage()); }
            sources.add(capability);
        }
        JsonObject result = new JsonObject(); result.add("sources", sources); return result;
    }
    JsonObject repository(String content, int sourceIndex, int page) throws Exception {
        if (page < 1 || page > 10000) throw new IllegalArgumentException("目录页码需为 1 至 10000");
        JsonArray list = sourceList(content);
        if (sourceIndex < 0 || sourceIndex >= list.size()) throw new IllegalArgumentException("来源索引无效");
        JsonObject source = list.get(sourceIndex).getAsJsonObject(); source.addProperty("_sourceIndex", sourceIndex);
        JsonObject config = repositoryConfig(source);
        boolean paginated = str(config, "url").contains("{page}");
        if (!paginated && page != 1) throw new IllegalArgumentException("该目录未声明分页");
        String url = str(config, "url").replace("{page}", Integer.toString(page));
        Document doc = Jsoup.parse(read(url), url);
        JsonArray parsed = parseWebHits(source, config, doc), hits = new JsonArray();
        Set<String> seen = new HashSet<>();
        for (JsonElement value : parsed) {
            JsonObject hit = value.getAsJsonObject();
            owner(content, str(hit, "sourceUrl"), sourceIndex);
            if (seen.add(str(hit, "sourceUrl"))) hits.add(hit);
        }
        boolean hasMore = false;
        if (paginated && page < 10000) {
            String expected = str(config, "url").replace("{page}", Integer.toString(page + 1));
            for (Element next : select(doc, str(config, "selectNextPage"))) {
                String address = link(next, "href");
                if (address.isBlank()) continue;
                if (!address.equals(expected)) throw new IllegalArgumentException("下一页地址与目录分页规则不匹配");
                hasMore = true;
            }
        }
        JsonArray warnings = new JsonArray();
        boolean truncated = parsed.size() >= 100;
        if (truncated) warnings.add("目录单页达到 100 项上限，可能未完整返回该页作品");
        JsonObject result = new JsonObject(); result.add("hits", hits); result.add("warnings", warnings);
        result.addProperty("truncated", truncated);
        result.addProperty("sourceIndex", sourceIndex); result.addProperty("page", page); result.addProperty("hasMore", hasMore);
        if (hasMore) result.addProperty("nextPage", page + 1);
        return result;
    }
    private JsonObject owner(String content, String url, Integer sourceIndex) throws Exception {
        URI target = SubscriptionFetchPolicy.validateUrl(url);
        JsonObject selected = null;
        int matches = 0;
        for (JsonObject source : rules(content)) {
            if (!str(source, "factoryId").equals("web-selector")) continue;
            if (sourceIndex != null && source.get("_sourceIndex").getAsInt() != sourceIndex) continue;
            JsonObject config = obj(obj(source, "arguments"), "searchConfig");
            URI base = SubscriptionFetchPolicy.validateUrl(str(config, "searchUrl").replace("{keyword}", "test"));
            String raw = str(config, "rawBaseUrl");
            boolean hostMatch = target.getHost().equalsIgnoreCase(base.getHost()) || !raw.isBlank() && target.getHost().equalsIgnoreCase(SubscriptionFetchPolicy.validateUrl(raw).getHost());
            if (!hostMatch) continue;
            if (sourceIndex != null) return source;
            selected = source; matches++;
        }
        if (sourceIndex != null) throw new IllegalArgumentException("来源索引无效或地址不属于该来源");
        if (matches > 1) throw new IllegalArgumentException("地址匹配多个来源，请提供 sourceIndex");
        if (selected != null) return selected;
        throw new IllegalArgumentException("地址不属于此订阅的网页来源；BT 资源请交给外部下载工具");
    }
    JsonObject preview(String content, String url) throws Exception {
        return preview(content, url, null);
    }
    JsonObject preview(String content, String url, Integer sourceIndex) throws Exception {
        JsonObject source = owner(content, url, sourceIndex), config = obj(obj(source, "arguments"), "searchConfig");
        Document doc = Jsoup.parse(read(url), url); JsonObject out = entry("", url, str(obj(source, "arguments"), "name"));
        out.addProperty("sourceIndex", source.get("_sourceIndex").getAsInt());
        out.addProperty("coverUrl", detailCover(doc));
        JsonArray episodes = new JsonArray();
        if (str(config, "channelFormatId").equals("no-channel")) {
            JsonObject sel = obj(config, "selectorChannelFormatNoChannel");
            addEpisodes(episodes, doc, str(sel, "selectEpisodes"), str(sel, "selectEpisodeLinks"), "main", source.get("_sourceIndex").getAsInt());
        } else {
            JsonObject sel = obj(config, "selectorChannelFormatFlattened");
            Elements groups = select(doc, str(sel, "selectEpisodeLists")), names = select(doc, str(sel, "selectChannelNames"));
            for (int i = 0; i < groups.size() && i < 30; i++) addEpisodes(episodes, groups.get(i), str(sel, "selectEpisodesFromList"), str(sel, "selectEpisodeLinksFromList"), i < names.size() ? names.get(i).text() : "线路" + (i + 1), source.get("_sourceIndex").getAsInt());
        }
        out.add("episodes", episodes); out.addProperty("summary", detailSummary(doc)); return out;
    }
    private static String detailSummary(Document doc) {
        if (doc.select("h1").size() == 1) {
            for (String selector : new String[]{"[itemprop=description]", ".stui-content__desc", ".module-info-introduction-content"}) {
                Elements descriptions = doc.select(selector).stream()
                        .filter(element -> !element.parents().stream().anyMatch(parent -> parent.is("aside, nav, footer")))
                        .collect(java.util.stream.Collectors.toCollection(Elements::new));
                if (descriptions.size() != 1) continue;
                String text = descriptions.first().text().trim();
                if (!text.isBlank()) return text.substring(0, Math.min(4000, text.length()));
            }
            Elements plotPanels = doc.select(".stui-pannel").stream()
                    .filter(panel -> !panel.parents().stream().anyMatch(parent -> parent.is("aside, nav, footer")))
                    .filter(panel -> panel.select(".stui-pannel__head h3").stream().anyMatch(heading ->
                            heading.text().trim().equals("剧情简介") && heading.closest(".stui-pannel") == panel))
                    .collect(java.util.stream.Collectors.toCollection(Elements::new));
            if (plotPanels.size() == 1) {
                Elements paragraphs = plotPanels.first().select(".stui-pannel_bd > p.col-pd");
                if (paragraphs.size() == 1) {
                    String text = paragraphs.first().text().trim();
                    if (!text.isBlank()) return text.substring(0, Math.min(4000, text.length()));
                }
            }
        }
        for (String selector : new String[]{"meta[property=og:description]", "meta[name=description]"}) {
            Elements descriptions = doc.select(selector);
            if (descriptions.size() != 1) continue;
            String text = descriptions.first().attr("content").trim();
            if (!text.isBlank()) return text.substring(0, Math.min(4000, text.length()));
        }
        return "";
    }
    private static String imageUrl(Element image) {
        for (String attr : new String[]{"data-src", "data-original", "data-lazy-src", "src"}) {
            String url = link(image, attr); if (!url.isBlank()) return url;
        }
        return "";
    }
    private static String detailCover(Document doc) {
        String metaCover = "";
        for (Element meta : doc.select("meta[property=og:image], meta[name=twitter:image]")) {
            String image = link(meta, "content");
            if (!image.isBlank()) { metaCover = image; break; }
        }
        Elements titles = doc.select("h1");
        if (titles.size() != 1) return metaCover;
        Element card = titles.first().parent();
        for (int depth = 0; card != null && depth < 6; depth++, card = card.parent()) {
            if (!card.is(".stui-content, .fire") && card.children().stream().noneMatch(child -> child.hasClass("stui-content__thumb"))) continue;
            Elements images = card.select(".stui-content__thumb img, .fire > .thumb > img");
            if (images.size() > 1) return metaCover;
            if (images.size() == 1) {
                String image = imageUrl(images.first());
                if (!image.isBlank()) return image;
            }
            return metaCover;
        }
        return metaCover;
    }
    private static void addEpisodes(JsonArray episodes, Element root, String namesSelector, String linksSelector, String line, int sourceIndex) {
        Elements names = select(root, namesSelector), links = linksSelector.isBlank() ? names : select(root, linksSelector);
        for (Element linkElement : links) {
            if (episodes.size() >= 500) break;
            String url = link(linkElement, "href"); if (url.isBlank()) continue;
            Elements belonging = new Elements();
            for (Element name : names) {
                if (name == linkElement || name.parents().contains(linkElement)) belonging.add(name);
                else if (linkElement.parents().contains(name)) {
                    int contained = 0;
                    for (Element candidate : links) if (candidate == name || candidate.parents().contains(name)) contained++;
                    if (contained == 1) belonging.add(name);
                }
            }
            String title = belonging.text();
            if (title.isBlank()) continue;
            JsonObject episode = new JsonObject(); episode.addProperty("id", url); episode.addProperty("title", title);
            episode.addProperty("sourceUrl", url); episode.addProperty("playbackUrl", ""); episode.addProperty("mimeType", ""); episode.addProperty("lineId", line); episodes.add(episode);
            episode.addProperty("sourceIndex", sourceIndex);
        }
    }
    JsonObject resolve(String content, String url) throws Exception {
        return resolve(content, url, null);
    }
    JsonObject resolve(String content, String url, Integer sourceIndex) throws Exception {
        JsonObject source = owner(content, url, sourceIndex), config = obj(obj(source, "arguments"), "searchConfig");
        String html = read(url); Document doc = Jsoup.parse(html, url); String media = "";
        for (Element e : select(doc, "video[src], video source[src], audio[src]")) { String candidate = link(e, "src"); if (MEDIA.matcher(candidate).matches()) { media = candidate; break; } }
        if (media.isEmpty()) {
            String player = staticPlayerUrl(html);
            if (!player.isBlank() && MEDIA.matcher(player).matches()) media = player;
        }
        if (media.isEmpty()) { var matcher = MEDIA.matcher(html.replace("\\/", "/").replace("&amp;", "&")); if (matcher.find()) media = matcher.group(); }
        if (media.isEmpty()) throw new IllegalArgumentException("未找到静态媒体直链；此来源可能需要脚本、播放器嗅探或验证码，请保留选集并换线");
        URI mediaUri = SubscriptionFetchPolicy.validateUrl(media);
        Future<?> lookup = DNS.submit(() -> { SubscriptionFetchPolicy.resolvePublic(mediaUri, resolver); return null; });
        try { lookup.get(8, TimeUnit.SECONDS); } finally { lookup.cancel(true); }
        JsonObject match = obj(config, "matchVideo");
        JsonArray warnings = new JsonArray();
        JsonObject declared = obj(match, "addHeadersToVideo"), headers = new JsonObject();
        String referer = str(declared, "referer"), agent = str(declared, "userAgent");
        if (!referer.isBlank()) { SubscriptionFetchPolicy.validateUrl(referer); headers.addProperty("Referer", referer); }
        if (!agent.isBlank()) {
            if (agent.length() > 512 || agent.chars().anyMatch(c -> c < 32 || c > 126)) throw new IllegalArgumentException("播放器标识无效");
            headers.addProperty("User-Agent", agent);
        }
        if (!str(match, "cookies").isBlank()) warnings.add("此来源可能需要额外授权，失败时请选择其他线路。");
        JsonObject out = new JsonObject(); out.addProperty("playbackUrl", media); out.addProperty("mimeType", media.contains(".m3u8") ? "application/x-mpegURL" : media.contains(".webm") ? "video/webm" : "video/mp4"); out.addProperty("sourceIndex", source.get("_sourceIndex").getAsInt()); out.add("requestHeaders", headers); out.add("warnings", warnings); return out;
    }

    private static String staticPlayerUrl(String html) {
        Matcher marker = Pattern.compile("\\bplayer_[A-Za-z0-9_]+\\s*=\\s*(\\{)").matcher(html);
        while (marker.find()) {
        int start = marker.start(1), depth = 0, end = -1;
        boolean quoted = false, escaped = false;
        for (int i = start; i < html.length(); i++) {
            char c = html.charAt(i);
            if (quoted) { if (escaped) escaped = false; else if (c == '\\') escaped = true; else if (c == '\"') quoted = false; continue; }
            if (c == '\"') quoted = true; else if (c == '{') depth++; else if (c == '}' && --depth == 0) { end = i + 1; break; }
        }
        if (end < 0) continue;
        try {
            JsonObject player = JsonParser.parseString(html.substring(start, end)).getAsJsonObject();
            String value = player.has("url") ? player.get("url").getAsString() : "";
            if (!value.startsWith("https://")) value = java.net.URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name());
            if (MEDIA.matcher(value).matches()) return value;
            if (value.matches("[A-Za-z0-9+/]{24,}={0,2}")) {
                String decoded = new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
                if (!decoded.startsWith("https://")) decoded = java.net.URLDecoder.decode(decoded.replace("+", "%2B"), StandardCharsets.UTF_8.name());
                if (MEDIA.matcher(decoded).matches()) return decoded;
            }
        } catch (Exception ignored) { }
        }
        return "";
    }
}
