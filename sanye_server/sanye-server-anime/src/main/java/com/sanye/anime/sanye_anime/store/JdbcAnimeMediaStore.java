package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** PostgreSQL 媒体元数据存储，只落库来源页和播放器地址。 */
@Repository
@ConditionalOnProperty(name = "sanye.media.store", havingValue = "pg", matchIfMissing = true)
public class JdbcAnimeMediaStore implements AnimeMediaStore {

    private final JdbcTemplate jdbc;
    private final String schema;

    /** 注入数据库访问和受控 schema 配置。 */
    public JdbcAnimeMediaStore(JdbcTemplate jdbc,
                               @Value("${sanye.media.schema:sanye_anime}") String schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** 拼接固定表名；schema 只来自部署配置，不接受请求参数。 */
    private String table() {
        return schema + ".sanye_anime_episode";
    }

    /** 按剧集编号读取作品媒体元数据。 */
    @Override
    public List<AnimeEpisode> episodesOf(long animeId) {
        return jdbc.query("select id, episode_no, title, source_page_url, playback_url, mime_type, source_label"
                        + " from " + table() + " where anime_id = ? order by episode_no",
                (rs, rowNum) -> new AnimeEpisode(rs.getLong("id"), rs.getInt("episode_no"),
                        rs.getString("title"), rs.getString("source_page_url"),
                        rs.getString("playback_url"), rs.getString("mime_type"),
                        rs.getString("source_label")), animeId);
    }

    /** 事务内删除旧剧集并写入新快照，保证重复导入结果稳定。 */
    @Transactional
    @Override
    public void replaceEpisodes(long animeId, List<AnimeEpisode> episodes) {
        jdbc.update("delete from " + table() + " where anime_id = ?", animeId);
        if (!episodes.isEmpty()) {
            String sql = "insert into " + table()
                    + " (anime_id, episode_no, title, source_page_url, playback_url, mime_type, source_label)"
                    + " values (?, ?, ?, ?, ?, ?, ?)";
            List<Object[]> batch = episodes.stream()
                    .map(episode -> new Object[]{animeId, episode.episodeNo(), episode.title(), episode.sourcePageUrl(),
                            episode.playbackUrl(), episode.mimeType(), episode.sourceLabel()})
                    .toList();
            jdbc.batchUpdate(sql, batch);
        }
    }
}
