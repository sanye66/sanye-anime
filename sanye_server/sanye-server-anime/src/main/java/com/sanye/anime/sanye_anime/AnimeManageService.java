package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.AdminAnimeView;
import com.sanye.anime.sanye_anime.model.AdminAnimeDetailView;
import com.sanye.anime.sanye_anime.store.AnimeCatalogStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 内容管理服务（T-F-03）：管理平台对作品状态的受控写入，业务端单一数据源。
 * 数据面经 AnimeCatalogStore（内存/PG 双实现，T-B-04）；新建默认草稿、发布联动公开可见性。
 */
@Service
public class AnimeManageService {

    /** 管理端允许流转的作品状态白名单。 */
    private static final Set<String> VALID_STATUSES = Set.of("草稿", "待审核", "已发布", "已下架");

    private final AnimeCatalogStore catalogStore;

    /** 注入目录存储，管理操作统一落到同一数据面。 */
    public AnimeManageService(AnimeCatalogStore catalogStore) {
        this.catalogStore = catalogStore;
    }

    /** 查询全部作品并补充管理状态与核验状态，供后台表格展示。 */
    public List<AdminAnimeView> listAll() {
        return catalogStore.allCards().stream()
                .map(card -> new AdminAnimeView(card.id(), card.title(), card.originalTitle(), card.type(),
                        "已发布".equals(card.status()) ? "已核验" : "待补充",
                        card.status(), LocalDate.now().toString()))
                .toList();
    }

    /** 查询作品管理详情，不存在的作品统一转换为业务层 404。 */
    public AdminAnimeDetailView get(long animeId) {
        AnimeMemoryStore.AnimeCard card = catalogStore.cardOf(animeId);
        if (card == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return toDetailView(card);
    }

    /**
     * 新建作品：数据面写入（初始管理状态草稿，公开不可见），
     * 发布由状态流转接口控制。title/type 必填，其余可空。
     */
    public AdminAnimeDetailView create(String title, String originalTitle, String type, Integer year,
                                       String summary, String tags, String updateText) {
        return create(title, originalTitle, type, year, summary, tags, updateText, null, null);
    }

    /** 创建带公开来源和封面的作品，封面只保存已上传的资源路径。 */
    public AdminAnimeDetailView create(String title, String originalTitle, String type, Integer year,
                                       String summary, String tags, String updateText,
                                       String sourceUrl, String coverUrl) {
        String safeTitle = requireText(title, "标题", 120);
        String safeType = requireText(type, "类型", 20);
        String safeOriginalTitle = normalize(originalTitle, 120);
        String safeSummary = normalize(summary, 2000);
        String safeUpdateText = normalize(updateText, 50);
        String safeSourceUrl = normalizeSourceUrl(sourceUrl);
        String safeCoverUrl = normalizeCoverUrl(coverUrl);
        int safeYear = safeYear(year);
        AnimeMemoryStore.AnimeCard card = catalogStore.addCard(
                safeTitle, safeOriginalTitle, safeType, safeYear, safeSummary, parseTags(tags),
                safeUpdateText, "草稿", safeSourceUrl, safeCoverUrl);
        return toDetailView(card, "草稿");
    }

    /**
     * 编辑作品：只更新传入的非空字段；标题/类型清空视为不修改。
     */
    public AdminAnimeDetailView update(long animeId, String title, String originalTitle, String type, Integer year,
                                       String summary, String tags, String updateText) {
        return update(animeId, title, originalTitle, type, year, summary, tags, updateText, null, null);
    }

    /** 更新作品内容，并按需替换来源页和已上传封面。 */
    public AdminAnimeDetailView update(long animeId, String title, String originalTitle, String type, Integer year,
                                       String summary, String tags, String updateText,
                                       String sourceUrl, String coverUrl) {
        AnimeMemoryStore.AnimeCard current = catalogStore.cardOf(animeId);
        if (current == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        String safeTitle = title == null || title.isBlank() ? current.title() : title.trim();
        if (safeTitle.length() > 120) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "标题不能超过 120 字");
        }
        String safeType = type == null || type.isBlank() ? current.type() : type.trim();
        if (safeType.length() > 20) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "类型不能超过 20 字");
        }
        String safeOriginalTitle = originalTitle == null || originalTitle.isBlank()
                ? current.originalTitle() : originalTitle.trim();
        String safeUpdateText = updateText == null || updateText.isBlank()
                ? current.updateText() : updateText.trim();
        int safeYear = year == null ? current.year() : safeYear(year);
        List<String> tagList = tags == null || tags.isBlank() ? current.tags() : parseTags(tags);
        String safeSummary = summary == null || summary.isBlank()
                ? catalogStore.summaryOf(animeId) : summary.trim();
        String safeSourceUrl = sourceUrl == null || sourceUrl.isBlank()
                ? catalogStore.sourceOf(animeId) : normalizeSourceUrl(sourceUrl);
        String safeCoverUrl = coverUrl == null || coverUrl.isBlank()
                ? current.coverUrl() : normalizeCoverUrl(coverUrl);
        AnimeMemoryStore.AnimeCard replaced = catalogStore.replaceCard(
                animeId, safeTitle, safeOriginalTitle, safeType, safeYear, safeSummary, tagList, safeUpdateText,
                safeSourceUrl, safeCoverUrl);
        if (replaced == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return toDetailView(replaced);
    }

    /** 校验状态白名单并更新作品状态，返回更新后的管理摘要。 */
    public AdminAnimeView updateStatus(long animeId, String status) {
        if (status == null || !VALID_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "不支持的作品状态：" + status);
        }
        AnimeMemoryStore.AnimeCard card = catalogStore.cardOf(animeId);
        if (card == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        catalogStore.updateStatus(animeId, status);
        return new AdminAnimeView(card.id(), card.title(), card.originalTitle(), card.type(),
                "已发布".equals(status) ? "已核验" : "待补充", status, LocalDate.now().toString());
    }

    /**
     * 公开可见性：管理端状态为“已发布”才对外可见（列表/详情）。
     */
    /** 判断作品是否已经达到公开展示状态。 */
    public boolean isPublished(long animeId) {
        return catalogStore.isPublished(animeId);
    }

    /** 将底层目录卡片转换为管理端详情模型。 */
    private AdminAnimeDetailView toDetailView(AnimeMemoryStore.AnimeCard card) {
        return toDetailView(card, catalogStore.statusOf(card.id()));
    }

    /** 按来源页查找已有作品，保证同一 URL 重试时不会产生重复作品。 */
    public AdminAnimeDetailView findBySourceUrl(String sourceUrl) {
        AnimeMemoryStore.AnimeCard card = catalogStore.findBySource(sourceUrl);
        return card == null ? null : toDetailView(card);
    }

    /** 按标题查找已有作品，导入重试时避免扫描并逐条读取来源。 */
    public AdminAnimeDetailView findByTitle(String title) {
        AnimeMemoryStore.AnimeCard card = catalogStore.findByTitle(title);
        return card == null ? null : toDetailView(card);
    }

    /** 将数据面记录转换为管理详情，并填充当前管理状态。 */
    private AdminAnimeDetailView toDetailView(AnimeMemoryStore.AnimeCard card, String status) {
        return new AdminAnimeDetailView(card.id(), card.title(), card.originalTitle(), card.type(), card.year(),
                catalogStore.summaryOf(card.id()), card.tags(), card.updateText(),
                card.coverUrl(), catalogStore.sourceOf(card.id()),
                "已发布".equals(status) ? "已核验" : "待补充", status, LocalDate.now().toString());
    }

    /** 将年份限制在可接受范围内，空值使用当前年份。 */
    private int safeYear(Integer year) {
        int safeYear = year == null ? LocalDate.now().getYear() : year;
        if (safeYear < 1900 || safeYear > 2100) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "年份必须在 1900-2100 之间");
        }
        return safeYear;
    }

    /** 校验必填文本并统一去除首尾空白。 */
    private String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, label + "不能为空");
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, label + "不能超过 " + max + " 字");
        }
        return trimmed;
    }

    /** 处理可选文本字段；空值保留为空串并执行长度限制。 */
    private String normalize(String value, int max) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "字段不能超过 " + max + " 字");
        }
        return trimmed;
    }

    /** 校验来源页必须是 HTTPS，防止管理数据登记为任意本地协议。 */
    private String normalizeSourceUrl(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > 1000 || !trimmed.matches("https://[^\\s]+")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "来源地址必须是 HTTPS 地址且不超过 1000 字");
        }
        return trimmed;
    }

    /** 校验封面为网关相对路径或 HTTPS 地址，避免写入 javascript 等危险协议。 */
    private String normalizeCoverUrl(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > 1000
                || !(trimmed.startsWith("/") || trimmed.matches("https://[^\\s]+"))) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "封面地址必须是站内路径或 HTTPS 地址且不超过 1000 字");
        }
        return trimmed;
    }

    /** 按中英文逗号拆分标签，同时去空、限长并去重。 */
    private List<String> parseTags(String tags) {
        if (tags == null || tags.isBlank()) {
            return List.of();
        }
        List<String> parsed = new ArrayList<>();
        for (String tag : tags.split("[,，]")) {
            String trimmed = tag.trim();
            if (!trimmed.isEmpty() && trimmed.length() <= 32 && !parsed.contains(trimmed)) {
                parsed.add(trimmed);
            }
        }
        return parsed;
    }
}
