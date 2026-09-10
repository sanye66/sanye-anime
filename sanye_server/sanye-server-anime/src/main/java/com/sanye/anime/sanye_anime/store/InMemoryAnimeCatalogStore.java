package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCard;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeDetail;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 内存作品目录存储（联调基线，线程安全）：委托 AnimeMemoryStore 数据面，
 * 管理状态进程内维护；服务重启数据丢失，正式持久化由 PostgreSQL 实现替换（T-B-04）。
 */
@Repository
@ConditionalOnProperty(name = "sanye.catalog.store", havingValue = "memory")
public class InMemoryAnimeCatalogStore implements AnimeCatalogStore {

    /** 外部封面不可用时使用的固定占位资源，保持内存联调与 PG 数据面一致。 */
    private static final String DEFAULT_COVER_URL = "/covers/anime-placeholder.svg";

    private final Map<Long, String> statusByAnimeId = new ConcurrentHashMap<>();
    private final Map<Long, String> sourceByAnimeId = new ConcurrentHashMap<>();
    private final AtomicLong idSequence = new AtomicLong(
            AnimeMemoryStore.CATALOG.stream().mapToLong(AnimeCard::id).max().orElse(0));

    /** 使用种子目录初始化内存数据面，供本地联调和测试环境直接使用。 */
    public InMemoryAnimeCatalogStore() {
        AnimeMemoryStore.CATALOG.forEach(card -> statusByAnimeId.put(card.id(), "已发布"));
    }

    /** 返回进程内目录快照，管理端和公开服务共享同一数据面。 */
    @Override
    public List<AnimeCard> allCards() {
        return AnimeMemoryStore.CATALOG;
    }

    /** 仅返回状态映射为已发布的作品。 */
    @Override
    public List<AnimeCard> publishedCards() {
        return AnimeMemoryStore.CATALOG.stream().filter(card -> isPublished(card.id())).toList();
    }

    /** 在内存目录中按编号查找作品。 */
    @Override
    public AnimeCard cardOf(long id) {
        return AnimeMemoryStore.CATALOG.stream().filter(card -> card.id() == id).findFirst().orElse(null);
    }

    /** 委托内存聚合逻辑生成详情。 */
    @Override
    public AnimeDetail detailOf(long id) {
        return isPublished(id) ? AnimeMemoryStore.detailOf(id) : null;
    }

    /** 生成新编号并写入内存目录，空状态默认为草稿。 */
    @Override
    public AnimeCard addCard(String title, String originalTitle, String type, int year,
                             String summary, List<String> tags, String updateText, String status) {
        return addCard(title, originalTitle, type, year, summary, tags, updateText, status, "", null);
    }

    /** 写入内存作品的来源和封面，供脚本导入和联调展示。 */
    @Override
    public AnimeCard addCard(String title, String originalTitle, String type, int year,
                             String summary, List<String> tags, String updateText, String status,
                             String source, String coverUrl) {
        long id = idSequence.incrementAndGet();
        AnimeCard card = new AnimeCard(id, title, originalTitle, type, year, 0.0, "已发布",
                coverUrl == null || coverUrl.isBlank() ? DEFAULT_COVER_URL : coverUrl,
                tags, updateText);
        AnimeMemoryStore.addCard(card, summary);
        statusByAnimeId.put(id, status == null ? "草稿" : status);
        sourceByAnimeId.put(id, source == null ? "" : source);
        return card;
    }

    /** 替换不可变 record 记录，同时保留评分和封面信息。 */
    @Override
    public AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                                 String summary, List<String> tags, String updateText) {
        return replaceCard(id, title, originalTitle, type, year, summary, tags, updateText, null, null);
    }

    /** 更新内存作品字段并保留未传入的来源或封面。 */
    @Override
    public AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                                 String summary, List<String> tags, String updateText,
                                 String source, String coverUrl) {
        AnimeCard current = cardOf(id);
        if (current == null) {
            return null;
        }
        AnimeCard updated = new AnimeCard(id, title, originalTitle, type, year, current.score(),
                current.status(), coverUrl == null || coverUrl.isBlank() ? current.coverUrl() : coverUrl,
                tags, updateText);
        AnimeMemoryStore.updateCard(updated, summary);
        if (source != null) {
            sourceByAnimeId.put(id, source);
        }
        return updated;
    }

    /** 更新进程内状态映射。 */
    @Override
    public void updateStatus(long id, String status) {
        statusByAnimeId.put(id, status);
    }

    /** 返回状态映射值，不存在记录按已发布兼容旧种子数据。 */
    @Override
    public String statusOf(long id) {
        return statusByAnimeId.getOrDefault(id, "已发布");
    }

    /** 根据作品标题读取简介，缺失时返回空串。 */
    @Override
    public String summaryOf(long id) {
        AnimeCard card = cardOf(id);
        return card == null ? "" : AnimeMemoryStore.SUMMARY.getOrDefault(card.title(), "");
    }

    /** 返回内存作品的来源页，未导入作品返回空串。 */
    @Override
    public String sourceOf(long id) {
        return sourceByAnimeId.getOrDefault(id, "");
    }

    /** 构造 id 到简介的映射，供组合筛选一次读取。 */
    @Override
    public Map<Long, String> summaryById() {
        Map<Long, String> result = new ConcurrentHashMap<>();
        AnimeMemoryStore.CATALOG.forEach(card ->
                result.put(card.id(), AnimeMemoryStore.SUMMARY.getOrDefault(card.title(), "")));
        return result;
    }
}
