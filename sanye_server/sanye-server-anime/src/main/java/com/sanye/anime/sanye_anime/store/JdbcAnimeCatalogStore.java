package com.sanye.anime.sanye_anime.store;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCard;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCharacter;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeDetail;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PostgreSQL 作品目录存储（T-B-04）：sanye_anime 表（V1 建表 + V3 扩展列/种子）作为数据面，
 * 公开侧按 status='已发布' 过滤，管理侧 CRUD 直接落库；服务重启后目录与管理状态可恢复。
 */
@Repository
@ConditionalOnProperty(name = "sanye.catalog.store", havingValue = "pg", matchIfMissing = true)
public class JdbcAnimeCatalogStore implements AnimeCatalogStore {

    /** 外部封面不可用时使用的固定占位资源，避免按动态 ID 拼出不存在的静态文件。 */
    private static final String DEFAULT_COVER_URL = "/covers/anime-placeholder.svg";

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };
    private static final TypeReference<List<AnimeCharacter>> CHARACTER_LIST = new TypeReference<>() {
    };

    private static final String COLUMNS =
            "id, title, original_title, type, year, summary, status, update_text, score, tags_json, characters_json, source, cover_url";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String schema;

    /** 注入数据库访问和 JSON 转换组件，schema 由受控配置决定。 */
    public JdbcAnimeCatalogStore(JdbcTemplate jdbc, ObjectMapper objectMapper,
                                 @Value("${sanye.catalog.schema:sanye_anime}") String schema) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.schema = schema;
    }

    /** 返回受控目录表名，业务字段仍通过 SQL 参数绑定。 */
    private String table() {
        // schema 来自配置，表名固定，避免把用户输入直接拼进查询条件。
        return schema + ".sanye_anime";
    }

    /** 从 PostgreSQL 读取全部未删除记录，供管理端查看草稿和下架作品。 */
    @Override
    public List<AnimeCard> allCards() {
        return jdbc.query("select " + COLUMNS + " from " + table() + " where deleted_at is null order by id",
                (rs, rowNum) -> mapCard(rs));
    }

    /** 从 PostgreSQL 读取已发布记录，作为公开接口的唯一数据入口。 */
    @Override
    public List<AnimeCard> publishedCards() {
        return jdbc.query("select " + COLUMNS + " from " + table()
                        + " where deleted_at is null and status = '已发布' order by id",
                (rs, rowNum) -> mapCard(rs));
    }

    /** 按编号读取一条未删除作品记录。 */
    @Override
    public AnimeCard cardOf(long id) {
        return jdbc.query("select " + COLUMNS + " from " + table()
                        + " where id = ? and deleted_at is null",
                (rs, rowNum) -> mapCard(rs), id)
                .stream().findFirst().orElse(null);
    }

    /** 读取并聚合数据库详情，补充相似作品和排期。 */
    @Override
    public AnimeDetail detailOf(long id) {
        return jdbc.query("select " + COLUMNS + " from " + table()
                        + " where id = ? and deleted_at is null and status = '已发布'",
                (rs, rowNum) -> mapDetail(rs), id)
                .stream().findFirst().orElse(null);
    }

    /** 插入新作品并返回数据库生成的编号。 */
    @Override
    public AnimeCard addCard(String title, String originalTitle, String type, int year,
                             String summary, List<String> tags, String updateText, String status) {
        Long id = jdbc.queryForObject(
                "insert into " + table()
                        + " (title, original_title, type, year, summary, status, update_text, score, tags_json, "
                        + "characters_json, source, published_at) values (?, ?, ?, ?, ?, ?, ?, 0, ?::jsonb, '[]'::jsonb, "
                        + "'管理端创建', now()) returning id",
                Long.class, title, originalTitle, type, year, summary,
                status == null ? "草稿" : status, updateText, toJson(tags));
        return new AnimeCard(id, title, originalTitle, type, year, 0.0,
                status == null ? "草稿" : status, DEFAULT_COVER_URL, tags, updateText);
    }

    /** 插入带来源和封面的作品，未提供封面时沿用静态占位封面。 */
    @Override
    public AnimeCard addCard(String title, String originalTitle, String type, int year,
                             String summary, List<String> tags, String updateText, String status,
                             String source, String coverUrl) {
        if (source == null && coverUrl == null) {
            return addCard(title, originalTitle, type, year, summary, tags, updateText, status);
        }
        Long id = jdbc.queryForObject(
                "insert into " + table()
                        + " (title, original_title, type, year, summary, status, update_text, score, tags_json, "
                        + "characters_json, source, published_at) values (?, ?, ?, ?, ?, ?, ?, 0, ?::jsonb, '[]'::jsonb, "
                        + "?, now()) returning id",
                Long.class, title, originalTitle, type, year, summary,
                status == null ? "草稿" : status, updateText, toJson(tags), source == null ? "" : source);
        AnimeCard card = new AnimeCard(id, title, originalTitle, type, year, 0.0,
                status == null ? "草稿" : status, coverUrl == null || coverUrl.isBlank()
                        ? DEFAULT_COVER_URL : coverUrl, tags, updateText);
        jdbc.update("update " + table() + " set cover_url = ? where id = ?", coverUrl, id);
        return card;
    }

    /** 更新作品内容字段，状态字段由独立状态接口维护。 */
    @Override
    public AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                                 String summary, List<String> tags, String updateText) {
        if (cardOf(id) == null) {
            return null;
        }
        jdbc.update("update " + table()
                        + " set title = ?, original_title = ?, type = ?, year = ?, summary = ?, "
                        + "update_text = ?, tags_json = ?::jsonb, updated_at = now() where id = ?",
                title, originalTitle, type, year, summary, updateText, toJson(tags), id);
        return cardOf(id);
    }

    /** 更新来源和封面；两个扩展字段为空时复用旧 SQL，兼容旧单测和调用方。 */
    @Override
    public AnimeCard replaceCard(long id, String title, String originalTitle, String type, int year,
                                 String summary, List<String> tags, String updateText,
                                 String source, String coverUrl) {
        if ((source == null || source.isBlank()) && (coverUrl == null || coverUrl.isBlank())) {
            return replaceCard(id, title, originalTitle, type, year, summary, tags, updateText);
        }
        if (cardOf(id) == null) {
            return null;
        }
        jdbc.update("update " + table()
                        + " set title = ?, original_title = ?, type = ?, year = ?, summary = ?, "
                        + "update_text = ?, tags_json = ?::jsonb, source = ?, cover_url = ?, updated_at = now()"
                        + " where id = ?",
                title, originalTitle, type, year, summary, updateText, toJson(tags), source, coverUrl, id);
        return cardOf(id);
    }

    /** 更新作品状态，更新行数为零时转换为业务层不存在异常。 */
    @Override
    public void updateStatus(long id, String status) {
        int updated = jdbc.update("update " + table() + " set status = ?, updated_at = now() where id = ?",
                status, id);
        if (updated <= 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
    }

    /** 查询数据库中的管理状态，兼容无记录时的默认状态。 */
    @Override
    public String statusOf(long id) {
        List<String> rows = jdbc.query("select status from " + table() + " where id = ?",
                (rs, rowNum) -> rs.getString(1), id);
        return rows.stream().findFirst().orElse("已发布");
    }

    /** 查询单部作品简介，缺失时返回空串。 */
    @Override
    public String summaryOf(long id) {
        List<String> rows = jdbc.query("select summary from " + table() + " where id = ?",
                (rs, rowNum) -> rs.getString(1), id);
        return rows.stream().findFirst().orElse("");
    }

    /** 查询数据库记录的来源页，未登记时返回空串。 */
    @Override
    public String sourceOf(long id) {
        List<String> rows = jdbc.query("select source from " + table() + " where id = ?",
                (rs, rowNum) -> rs.getString(1), id);
        return rows.stream().findFirst().orElse("");
    }

    /** 通过来源地址单条查询，供重复导入幂等判断使用。 */
    @Override
    public AnimeCard findBySource(String source) {
        if (source == null || source.isBlank()) return null;
        return jdbc.query("select " + COLUMNS + " from " + table()
                        + " where source = ? and deleted_at is null order by id limit 1",
                (rs, rowNum) -> mapCard(rs), source).stream().findFirst().orElse(null);
    }

    /** 通过标题单条查询，避免导入时全表扫描。 */
    @Override
    public AnimeCard findByTitle(String title) {
        if (title == null || title.isBlank()) return null;
        return jdbc.query("select " + COLUMNS + " from " + table()
                        + " where title = ? and deleted_at is null order by id limit 1",
                (rs, rowNum) -> mapCard(rs), title).stream().findFirst().orElse(null);
    }

    /** 批量读取简介映射，避免列表筛选触发 N+1 查询。 */
    @Override
    public Map<Long, String> summaryById() {
        Map<Long, String> result = new ConcurrentHashMap<>();
        jdbc.query("select id, summary from " + table() + " where deleted_at is null",
                (rs, rowNum) -> {
                    result.put(rs.getLong(1), rs.getString(2) == null ? "" : rs.getString(2));
                    return null;
                });
        return result;
    }

    /** 将目录查询行映射为公开/管理共用的卡片模型。 */
    private AnimeCard mapCard(ResultSet rs) throws SQLException {
        long id = rs.getLong("id");
        String coverUrl = rs.getString("cover_url");
        // 兼容旧数据中按动态 ID 生成但实际不存在的占位路径，避免导入失败作品出现破图。
        if (coverUrl == null || coverUrl.isBlank()
                || (id > 15 && coverUrl.matches("/covers/anime-\\d+\\.svg"))) {
            coverUrl = DEFAULT_COVER_URL;
        }
        return new AnimeCard(id, rs.getString("title"), rs.getString("original_title"), rs.getString("type"),
                rs.getInt("year"), rs.getDouble("score"), rs.getString("status"),
                coverUrl,
                parseStrings(rs.getString("tags_json")),
                rs.getString("update_text"));
    }

    /** 将详情查询行映射为详情模型并计算相似作品。 */
    private AnimeDetail mapDetail(ResultSet rs) throws SQLException {
        AnimeCard card = mapCard(rs);
        List<AnimeCharacter> characters = parseCharacters(rs.getString("characters_json"));
        List<AnimeCard> similar = publishedCards().stream()
                .filter(c -> c.id() != card.id())
                .sorted(Comparator.comparingLong((AnimeCard c) -> sharedTags(c, card)).reversed()
                        .thenComparing(Comparator.comparingDouble(AnimeCard::score).reversed()))
                .limit(3)
                .toList();
        return new AnimeDetail(card.id(), card.title(), card.originalTitle(), card.type(), card.year(),
                card.score(), "已发布", card.coverUrl(), card.tags(), card.updateText(),
                rs.getString("summary"), false, characters, similar, buildSchedule(card),
                rs.getString("source"));
    }

    /** 统计两个作品共同标签数量，用于相似度排序。 */
    private long sharedTags(AnimeCard card, AnimeCard other) {
        return card.tags().stream().filter(other.tags()::contains).count();
    }

    /** 安全解析标签 JSON，损坏数据按空列表降级。 */
    private List<String> parseStrings(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    /** 安全解析角色 JSON，损坏数据按空列表降级。 */
    private List<AnimeCharacter> parseCharacters(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, CHARACTER_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    /** 将标签列表编码为数据库 JSON，序列化失败时写入空数组。 */
    private String toJson(List<String> tags) {
        try {
            return objectMapper.writeValueAsString(tags == null ? List.of() : tags);
        } catch (Exception ex) {
            return "[]";
        }
    }
}
