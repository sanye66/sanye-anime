package com.sanye.anime.sanye_anime.store;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimePlaybackOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** PostgreSQL 媒体元数据存储，完整保留来源页、主线路和备用线路。 */
@Repository
@ConditionalOnProperty(name = "sanye.media.store", havingValue = "pg", matchIfMissing = true)
public class JdbcAnimeMediaStore implements AnimeMediaStore {

    private static final TypeReference<List<AnimePlaybackOption>> PLAYBACK_OPTION_LIST = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String schema;

    /** 注入数据库访问和受控 schema 配置。 */
    public JdbcAnimeMediaStore(JdbcTemplate jdbc, ObjectMapper objectMapper,
                               @Value("${sanye.media.schema:sanye_anime}") String schema) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.schema = schema;
    }

    /** 拼接固定表名；schema 只来自部署配置，不接受请求参数。 */
    private String table() {
        return schema + ".sanye_anime_episode";
    }

    /** 按剧集编号读取作品媒体元数据。 */
    @Override
    public List<AnimeEpisode> episodesOf(long animeId) {
        return jdbc.query("select id, episode_no, title, source_page_url, playback_url, mime_type, source_label, playback_options_json"
                        + " from " + table() + " where anime_id = ? order by episode_no",
                (rs, rowNum) -> new AnimeEpisode(rs.getLong("id"), rs.getInt("episode_no"),
                        rs.getString("title"), rs.getString("source_page_url"),
                        rs.getString("playback_url"), rs.getString("mime_type"),
                        rs.getString("source_label"), parsePlaybackOptions(rs.getString("playback_options_json"))), animeId);
    }

    /** 事务内删除旧剧集并写入新快照，保证重复导入结果稳定。 */
    @Transactional
    @Override
    public void replaceEpisodes(long animeId, List<AnimeEpisode> episodes) {
        jdbc.update("delete from " + table() + " where anime_id = ?", animeId);
        if (!episodes.isEmpty()) {
            String sql = "insert into " + table()
                    + " (anime_id, episode_no, title, source_page_url, playback_url, mime_type, source_label, playback_options_json)"
                    + " values (?, ?, ?, ?, ?, ?, ?, ?::jsonb)";
            List<Object[]> batch = episodes.stream()
                    .map(episode -> new Object[]{animeId, episode.episodeNo(), episode.title(), episode.sourcePageUrl(),
                            episode.playbackUrl(), episode.mimeType(), episode.sourceLabel(),
                            toJson(episode.playbackOptions())})
                    .toList();
            jdbc.batchUpdate(sql, batch);
        }
    }

    /** 损坏的历史 JSON 按无备用线路降级，主播放地址仍可继续使用。 */
    private List<AnimePlaybackOption> parsePlaybackOptions(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, PLAYBACK_OPTION_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    /** 将线路快照编码为 JSON；序列化异常时保留旧单线路字段作为降级。 */
    private String toJson(List<AnimePlaybackOption> options) {
        try {
            return objectMapper.writeValueAsString(options == null ? List.of() : options);
        } catch (Exception ex) {
            return "[]";
        }
    }
}
