package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_anime.store.AnimeCatalogStore;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 作品目录服务（T-D-02/T-D-04）：列表组合筛选 + 分页（仅已发布）、详情聚合。
 * 数据面经 AnimeCatalogStore（内存/PG 双实现，T-B-04），接口契约不变。
 */
@Service
public class AnimeCatalogService {

    private final AnimeCatalogStore catalogStore;

    /** 注入目录存储，确保公开查询始终通过统一发布状态校验。 */
    public AnimeCatalogService(AnimeCatalogStore catalogStore) {
        this.catalogStore = catalogStore;
    }

    /** 校验筛选参数，组合已发布数据、简介和标签后执行分页。 */
    public PageResult<AnimeMemoryStore.AnimeCard> list(String keyword, String type, String status,
                                                       Integer year, Integer yearBefore, int page, int size) {
        if (keyword != null && keyword.length() > 100) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "关键词不能超过 100 字");
        }
        if (type != null && type.length() > 20) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "类型参数过长");
        }
        if (status != null && status.length() > 20) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "状态参数过长");
        }
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        String normalizedKeyword = normalizeForMatch(keyword);
        List<AnimeMemoryStore.AnimeCard> all = catalogStore.publishedCards().stream()
                .filter(a -> normalizedKeyword.isBlank()
                        || normalizeForMatch(a.title() + a.originalTitle()).contains(normalizedKeyword))
                .filter(a -> type == null || type.isBlank() || a.type().equals(type))
                .filter(a -> !matchesStatus(a, status))
                .filter(a -> year == null || a.year() == year)
                .filter(a -> yearBefore == null || a.year() <= yearBefore)
                .toList();
        List<AnimeMemoryStore.AnimeCard> rows = all.stream()
                .skip((long) (safePage - 1) * safeSize)
                .limit(safeSize)
                .toList();
        return PageResult.of(rows, safePage, safeSize, all.size());
    }

    /** 只允许读取已发布作品的详情，避免草稿通过公开接口泄露。 */
    public AnimeMemoryStore.AnimeDetail detail(long id) {
        AnimeMemoryStore.AnimeDetail detail = catalogStore.detailOf(id);
        if (detail == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return detail;
    }

    /** 生成首页的最近更新和热门两个业务分区。 */
    public AnimeMemoryStore.HomeResponse home(String tab) {
        List<AnimeMemoryStore.AnimeCard> published = catalogStore.publishedCards();
        List<AnimeMemoryStore.AnimeCard> recent = published.stream()
                .filter(a -> a.updateText() != null
                        && (a.updateText().contains("更新") || a.updateText().equals("已完结")))
                .sorted((a, b) -> Integer.compare(b.year(), a.year()))
                .limit(4)
                .toList();
        List<AnimeMemoryStore.AnimeCard> popular = published.stream()
                .sorted((a, b) -> Double.compare(b.score(), a.score()))
                .limit(4)
                .toList();
        // 导入器写入的作品可能还没有评分和排期文案，单独按目录编号展示，避免导入成功后首页完全不可见。
        List<AnimeMemoryStore.AnimeCard> imported = published.stream()
                .filter(a -> a.updateText() == null || a.updateText().isBlank())
                .sorted(Comparator.comparingLong(AnimeMemoryStore.AnimeCard::id))
                .limit(6)
                .toList();
        return new AnimeMemoryStore.HomeResponse(
                List.of(),
                List.of(
                        new AnimeMemoryStore.HomeSection("recent", "最近更新", recent),
                        new AnimeMemoryStore.HomeSection("popular", "热门动漫", popular),
                        new AnimeMemoryStore.HomeSection("imported", "最近导入", imported)
                ),
                List.of());
    }

    /** 返回官网首屏所需的少量精选作品，限制数量避免公开接口过载。 */
    public List<AnimeMemoryStore.AnimeCard> publicHomePicks() {
        return catalogStore.publishedCards().stream().limit(3).toList();
    }

    /**
     * 状态筛选：连载中 → 更新文案含“更新”；已完结 → 更新文案为“已完结”；其余按原文匹配。
     */
    private boolean matchesStatus(AnimeMemoryStore.AnimeCard card, String status) {
        if (status == null || status.isBlank()) {
            return false;
        }
        if ("连载中".equals(status)) {
            return card.updateText() == null || !card.updateText().contains("更新");
        }
        if ("已完结".equals(status)) {
            return !"已完结".equals(card.updateText());
        }
        return !status.equals(card.updateText()) && !status.equals(card.status());
    }

    private String normalizeForMatch(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT);
        return normalized.replaceAll("[\\p{P}\\p{S}\\s]+", "");
    }
}
