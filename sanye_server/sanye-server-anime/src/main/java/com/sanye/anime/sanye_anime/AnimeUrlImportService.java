package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.media.MediaImportService;
import com.sanye.anime.sanye_anime.media.MediaPageFetcher;
import com.sanye.anime.sanye_anime.model.AdminAnimeDetailView;
import com.sanye.anime.sanye_anime.model.AdminAnimeImportResult;
import com.sanye.anime.sanye_anime.model.AnimeUrlPreviewResult;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Matcher;

/** URL 一键导入服务：读取授权公开详情页，写入作品简介、封面和剧集媒体元数据。 */
@Service
public class AnimeUrlImportService {

    private final AnimeManageService animeManageService;
    private final MediaImportService mediaImportService;
    private final MediaPageFetcher pageFetcher;
    private final HomeAggregationService homeAggregationService;

    /** 复用作品管理、媒体导入和受限页面读取器，避免新增网络访问路径。 */
    public AnimeUrlImportService(AnimeManageService animeManageService,
                                 MediaImportService mediaImportService,
                                 MediaPageFetcher pageFetcher,
                                 HomeAggregationService homeAggregationService) {
        this.animeManageService = animeManageService;
        this.mediaImportService = mediaImportService;
        this.pageFetcher = pageFetcher;
        this.homeAggregationService = homeAggregationService;
    }

    /** 导入或按标题更新作品，并把同一来源页中的视频资源导入到该作品。 */
    public AdminAnimeImportResult importFrom(String sourceUrl, boolean publish) {
        URI uri = mediaImportService.validateSourceUrl(sourceUrl);
        URI metadataUri = metadataPage(uri);
        String rootHtml = pageFetcher.fetch(uri);
        String metadataHtml = rootHtml;
        // 当前播放页通常已经包含标题和作品封面，优先复用它，避免无条件再请求 /v 详情页。
        if (!metadataUri.equals(uri) && rootHtml != null && !rootHtml.isBlank()) {
            AnimeMetadata rootMetadata = parseMetadata(Jsoup.parse(rootHtml, uri.toString()), uri.toString());
            if (rootMetadata.title().isBlank() || rootMetadata.coverUrl().isBlank()) {
                metadataHtml = pageFetcher.fetch(metadataUri);
            }
        }
        if (metadataHtml == null || metadataHtml.isBlank()) {
            metadataUri = uri;
            metadataHtml = rootHtml;
        }
        Document document = Jsoup.parse(metadataHtml, metadataUri.toString());
        AnimeMetadata metadata = parseMetadata(document, metadataUri.toString());
        if (metadata.title().isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "来源页面未解析出作品标题");
        }

        AdminAnimeDetailView anime = animeManageService.findBySourceUrl(uri.toString());
        if (anime == null) {
            anime = animeManageService.findByTitle(metadata.title());
        }
        if (anime == null) {
            anime = animeManageService.create(metadata.title(), metadata.originalTitle(), metadata.type(), metadata.year(),
                    metadata.summary(), String.join(",", metadata.tags()), metadata.updateText(),
                    uri.toString(), metadata.coverUrl());
        } else {
            anime = animeManageService.update(anime.id(), metadata.title(), metadata.originalTitle(), metadata.type(),
                    metadata.year(), metadata.summary(), String.join(",", metadata.tags()), metadata.updateText(),
                    uri.toString(), metadata.coverUrl());
        }
        if (publish && !"已发布".equals(anime.status())) {
            animeManageService.updateStatus(anime.id(), "已发布");
            anime = animeManageService.get(anime.id());
        }
        int episodesImported = mediaImportService.importFrom(anime.id(), uri.toString(), rootHtml).size();
        homeAggregationService.invalidate("FEATURED");
        return new AdminAnimeImportResult(anime, episodesImported);
    }

    /** 读取外部作品的公开元数据和播放地址，供客户端使用站内播放器直接观看。 */
    public AnimeUrlPreviewResult previewFrom(String sourceUrl) {
        URI uri = mediaImportService.validateSourceUrl(sourceUrl);
        URI metadataUri = metadataPage(uri);
        String rootHtml = pageFetcher.fetch(uri);
        String metadataHtml = rootHtml;
        if (!metadataUri.equals(uri) && rootHtml != null && !rootHtml.isBlank()) {
            AnimeMetadata rootMetadata = parseMetadata(Jsoup.parse(rootHtml, uri.toString()), uri.toString());
            if (rootMetadata.title().isBlank() || rootMetadata.coverUrl().isBlank()) {
                metadataHtml = pageFetcher.fetch(metadataUri);
            }
        }
        Document document = Jsoup.parse(metadataHtml == null ? "" : metadataHtml, metadataUri.toString());
        AnimeMetadata metadata = parseMetadata(document, metadataUri.toString());
        if (metadata.title().isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "来源页面未解析出作品标题");
        }
        return new AnimeUrlPreviewResult(metadata.title(), metadata.originalTitle(), metadata.type(), metadata.year(),
                metadata.summary(), metadata.tags(), metadata.updateText(), metadata.coverUrl(), uri.toString(),
                mediaImportService.parseEpisodes(uri.toString(), rootHtml));
    }

    /** 播放页缺少封面和规范标题时，优先读取同作品的公开详情页。 */
    private URI metadataPage(URI source) {
        Matcher matcher = java.util.regex.Pattern.compile("^/p/([^/]+)/([^/]+)/[^/]+/?$")
                .matcher(source.getPath() == null ? "" : source.getPath());
        if (!matcher.matches()) {
            return source;
        }
        return URI.create(source.getScheme() + "://" + source.getAuthority()
                + "/v/" + matcher.group(1) + "/" + matcher.group(2));
    }

    /** 从公开详情页解析作品元数据，优先读取旧式详情模板。 */
    private AnimeMetadata parseMetadata(Document document, String sourceUrl) {
        String rawTitle = firstText(document,
                "#title_name [title]", "#title_name", ".module-info-heading h1", ".article-title", "meta[property=og:title]",
                "meta[name=twitter:title]", "title");
        String title = normalizeTitle(rawTitle);
        String summary = cleanText(firstText(document,
                ".jianjie", "meta[property=og:description]", "meta[name=description]"), 2000)
                .replaceFirst("^剧情[:：]\\s*", "");
        String coverUrl = firstImage(document, sourceUrl);
        String typeText = cleanText(textAfterStrong(document, "类型"), 40);
        String published = textAfterStrong(document, "首播");
        Integer year = firstYear(published.isBlank() ? document.text() : published);
        String type = title.matches(".*(剧场版|电影|你的名字).*") || typeText.matches(".*(电影|剧场).*")
                ? "剧场版" : "电视动画";
        String keywords = firstMeta(document, "keywords");
        return new AnimeMetadata(title, "", type, year, summary, parseTags(keywords), "", coverUrl);
    }

    private String firstText(Document document, String... selectors) {
        for (String selector : selectors) {
            Element element = document.selectFirst(selector);
            if (element == null) {
                continue;
            }
            String value = selector.startsWith("meta") ? element.attr("content") : element.text();
            if (!value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String firstMeta(Document document, String name) {
        Element element = document.selectFirst("meta[name=" + name + "]");
        return element == null ? "" : element.attr("content");
    }

    /** 读取详情页封面，回退到 Open Graph 图片。 */
    private String firstImage(Document document, String sourceUrl) {
        // 播放页的相关推荐可能排在正文前，优先使用页面脚本声明的当前作品 imgUrl。
        for (Element script : document.select("script")) {
            Matcher visitImage = java.util.regex.Pattern.compile(
                    "['\"]imgUrl['\"]\\s*:\\s*['\"]([^'\"]+)['\"]", java.util.regex.Pattern.CASE_INSENSITIVE)
                    .matcher(script.html());
            if (visitImage.find()) {
                String value = visitImage.group(1).replace("\\/", "/");
                String resolved = resolveHttpsImage(value, sourceUrl);
                if (!resolved.isBlank()) {
                    return resolved;
                }
            }
        }
        Element image = document.selectFirst(
                ".module-item-cover img[data-original], .video_img img[data-original], .video_img img[src], img[data-original][alt]");
        String value = "";
        if (image != null) {
            value = image.hasAttr("data-original") ? image.attr("abs:data-original") : image.attr("abs:src");
        }
        if (value.isBlank()) {
            Element meta = document.selectFirst("meta[property=og:image], meta[name=twitter:image]");
            value = meta == null ? "" : meta.attr("content");
        }
        if (value.isBlank()) {
            return "";
        }
        return resolveHttpsImage(value, sourceUrl);
    }

    /** 将页面图片地址解析为 HTTPS 绝对地址。 */
    private String resolveHttpsImage(String value, String sourceUrl) {
        try {
            URI uri = URI.create(sourceUrl).resolve(value);
            return "https".equalsIgnoreCase(uri.getScheme()) ? uri.toString() : "";
        } catch (IllegalArgumentException ex) {
            return "";
        }
    }

    private String textAfterStrong(Document document, String label) {
        for (Element strong : document.select(".video_info strong")) {
            if (strong.text().replace("：", ":").startsWith(label + ":")) {
                String parentText = strong.parent() == null ? "" : strong.parent().text();
                return parentText.replaceFirst(".*" + label + "[:：]\\s*", "").split("\\s+")[0];
            }
        }
        return "";
    }

    private Integer firstYear(String value) {
        Matcher matcher = java.util.regex.Pattern.compile("(?:19|20)\\d{2}").matcher(value == null ? "" : value);
        if (!matcher.find()) {
            return LocalDate.now().getYear();
        }
        return Integer.valueOf(matcher.group());
    }

    private List<String> parseTags(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(value.split("[,，、|/]"))
                .map(item -> cleanText(item, 32))
                .filter(item -> !item.isBlank())
                .distinct()
                .limit(12)
                .toList();
    }

    private String normalizeTitle(String value) {
        String title = cleanText(value, 120);
        Matcher quoted = java.util.regex.Pattern.compile("《([^《》]{1,120})》").matcher(title);
        if (quoted.find()) {
            return quoted.group(1).trim();
        }
        return title
                .replaceFirst("(?:在线(?:观看|播放|免费观看)|在线观看)\\s*$", "")
                .replaceFirst("\\s*[|｜-]\\s*(?:日本动漫大全|樱花动漫).*$", "")
                .trim();
    }

    private String cleanText(String value, int max) {
        String text = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private record AnimeMetadata(String title, String originalTitle, String type, Integer year,
                                 String summary, List<String> tags, String updateText, String coverUrl) {
    }
}
