package com.sanye.anime.sanye_favorite;

import com.sanye.anime.sanye_favorite.client.AnimeBrief;
import com.sanye.anime.sanye_favorite.client.AnimeClient;
import com.sanye.anime.sanye_favorite.model.FavoriteItem;
import com.sanye.anime.sanye_favorite.model.HistoryItem;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 收藏与历史服务（T-F-02，设备级过渡）：owner_key 维度增删查，作品信息经
 * AnimeClient 回源动漫服务；CAS 接入后 owner_key 自动切到 user:xxx。
 */
@Service
public class FavoriteService {

    private static final Logger log = LoggerFactory.getLogger(FavoriteService.class);

    private final JdbcTemplate jdbc;
    private final AnimeClient animeClient;
    private final String schema;

    /** 注入收藏数据库和作品远程客户端，统一执行所有权与作品存在性校验。 */
    public FavoriteService(JdbcTemplate jdbc, AnimeClient animeClient,
                           @Value("${sanye.favorite.schema:sanye_favorite}") String schema) {
        this.jdbc = jdbc;
        this.animeClient = animeClient;
        this.schema = schema;
    }

    /** 校验作品存在后幂等写入收藏关系。 */
    public void add(String ownerKey, long animeId) {
        requirePositive(animeId);
        fetchAnime(animeId);
        jdbc.update("insert into " + favoriteTable()
                        + " (owner_key, anime_id) values (?, ?) on conflict (owner_key, anime_id) do nothing",
                ownerKey, animeId);
    }

    /** 删除指定归属人的收藏关系。 */
    public void remove(String ownerKey, long animeId) {
        requirePositive(animeId);
        jdbc.update("delete from " + favoriteTable() + " where owner_key = ? and anime_id = ?", ownerKey, animeId);
    }

    /** 查询指定归属人是否已收藏作品。 */
    public boolean isFavorite(String ownerKey, long animeId) {
        requirePositive(animeId);
        Integer count = jdbc.queryForObject(
                "select count(*) from " + favoriteTable() + " where owner_key = ? and anime_id = ?",
                Integer.class, ownerKey, animeId);
        return count != null && count > 0;
    }

    /** 查询收藏分页，并回源补齐作品摘要。 */
    public PageResult<FavoriteItem> list(String ownerKey, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        Long total = jdbc.queryForObject(
                "select count(*) from " + favoriteTable() + " where owner_key = ?", Long.class, ownerKey);
        List<FavoriteItem> items = jdbc.query(
                "select anime_id, created_at from " + favoriteTable()
                        + " where owner_key = ? order by created_at desc limit ? offset ?",
                (rs, rowNum) -> new FavoriteItem(fetchAnime(rs.getLong("anime_id")),
                        rs.getTimestamp("created_at").toInstant().toString()),
                ownerKey, safeSize, (long) (safePage - 1) * safeSize);
        return PageResult.of(items, safePage, safeSize, total == null ? 0 : total);
    }

    /** 校验作品存在后插入或更新观看时间。 */
    public void recordHistory(String ownerKey, long animeId) {
        requirePositive(animeId);
        fetchAnime(animeId);
        jdbc.update("insert into " + historyTable()
                        + " (owner_key, anime_id, last_view_at) values (?, ?, now()) "
                        + "on conflict (owner_key, anime_id) do update set last_view_at = now()",
                ownerKey, animeId);
    }

    /** 查询观看历史分页，并回源补齐作品摘要。 */
    public PageResult<HistoryItem> history(String ownerKey, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        Long total = jdbc.queryForObject(
                "select count(*) from " + historyTable() + " where owner_key = ?", Long.class, ownerKey);
        List<HistoryItem> items = jdbc.query(
                "select anime_id, last_view_at from " + historyTable()
                        + " where owner_key = ? order by last_view_at desc limit ? offset ?",
                (rs, rowNum) -> new HistoryItem(fetchAnime(rs.getLong("anime_id")),
                        rs.getTimestamp("last_view_at").toInstant().toString()),
                ownerKey, safeSize, (long) (safePage - 1) * safeSize);
        return PageResult.of(items, safePage, safeSize, total == null ? 0 : total);
    }

    /** 调用动画服务确认作品可见，远程失败统一转为资源不存在。 */
    private AnimeBrief fetchAnime(long animeId) {
        try {
            ApiResponse<AnimeBrief> response = animeClient.getAnime(animeId);
            if (response != null && response.code() == 0 && response.data() != null) {
                return response.data();
            }
        } catch (RuntimeException ex) {
            log.warn("收藏回源动漫服务失败 animeId={} error={}", animeId, ex.getMessage());
        }
        throw new BusinessException(ErrorCode.NOT_FOUND, "作品不存在或不可见");
    }

    /** 拒绝非正作品编号，避免无效 SQL 和异常回源请求。 */
    private void requirePositive(long animeId) {
        if (animeId <= 0) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "animeId 必须为正整数");
        }
    }

    /** 返回收藏关系表名。 */
    private String favoriteTable() {
        return schema + ".sanye_user_favorite";
    }

    /** 返回观看历史表名。 */
    private String historyTable() {
        return schema + ".sanye_user_watch_history";
    }
}
