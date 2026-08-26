package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCard;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeDetail;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeSchedule;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 作品目录数据访问抽象（T-B-04）：公开侧按管理状态过滤，管理侧 CRUD。
 * 内存实现（联调基线）与 PostgreSQL 实现（正式数据面）切换，接口契约不变。
 */
public interface AnimeCatalogStore {

    /** 查询全部目录记录，供管理端使用，包含未发布状态。 */
    List<AnimeCard> allCards();

    /** 查询公开可见目录记录，存储实现必须过滤非已发布状态。 */
    List<AnimeCard> publishedCards();

    /** 按编号返回原始目录记录，不存在时返回空引用。 */
    AnimeCard cardOf(long id);

    /** 聚合详情、角色、相似作品和排期数据。 */
    AnimeDetail detailOf(long id);

    /** 新增作品并返回存储实现生成的目录记录。 */
    AnimeCard addCard(String title, String originalTitle, String type, int year,
                      String summary, List<String> tags, String updateText, String status);

    /** 新增带来源和封面的作品，旧调用方继续使用兼容方法。 */
    default AnimeCard addCard(String title, String originalTitle, String type, int year,
                              String summary, List<String> tags, String updateText, String status,
                              String source, String coverUrl) {
        return addCard(title, originalTitle, type, year, summary, tags, updateText, status);
    }

    /** 替换指定作品的可编辑字段，不存在时返回空引用。 */
    AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                          String summary, List<String> tags, String updateText);

    /** 更新带来源和封面的作品，空扩展字段由实现保留原值。 */
    default AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                                  String summary, List<String> tags, String updateText,
                                  String source, String coverUrl) {
        return replaceCard(id, title, originalTitle, type, year, summary, tags, updateText);
    }

    /** 更新管理状态，公开可见性由状态值统一决定。 */
    void updateStatus(long id, String status);

    /** 查询作品管理状态，不存在时按实现约定返回默认值。 */
    String statusOf(long id);

    String summaryOf(long id);

    /** 查询作品来源页；没有来源的内存记录返回空串。 */
    default String sourceOf(long id) {
        return "";
    }

    /** 按公开来源地址查找作品；正式数据库实现应使用单条索引查询。 */
    default AnimeCard findBySource(String source) {
        if (source == null || source.isBlank()) return null;
        return allCards().stream().filter(card -> source.equals(sourceOf(card.id()))).findFirst().orElse(null);
    }

    /** 按标题查找作品；正式数据库实现应使用单条索引查询。 */
    default AnimeCard findByTitle(String title) {
        if (title == null || title.isBlank()) return null;
        return allCards().stream().filter(card -> title.equals(card.title())).findFirst().orElse(null);
    }

    /** 一次性返回简介映射，供筛选逻辑避免逐条查询。 */
    java.util.Map<Long, String> summaryById();

    /** 判断作品是否处于公开发布状态。 */
    default boolean isPublished(long id) {
        return "已发布".equals(statusOf(id));
    }

    /** 根据更新文案构造未来三集的简化排期。 */
    default List<AnimeSchedule> buildSchedule(AnimeCard card) {
        if (!card.updateText().contains("更新")) {
            return List.of();
        }
        List<AnimeSchedule> schedule = new ArrayList<>();
        LocalDate base = LocalDate.now().plusDays(1);
        for (int i = 0; i < 3; i++) {
            schedule.add(new AnimeSchedule(i + 1, base.plusDays(i * 7L).toString(), i == 0 ? "AIRING" : "PLANNED"));
        }
        return schedule;
    }
}
