package com.sanye.anime.sanye_anime.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimePlaybackOption;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 媒体元数据内存和 PostgreSQL 存储的最小契约测试。 */
class AnimeMediaStoreTest {

    @Test
    void memoryStoreReturnsImmutableSnapshotAndReplaces() {
        InMemoryAnimeMediaStore store = new InMemoryAnimeMediaStore();
        AnimeEpisode episode = episode(1);

        store.replaceEpisodes(7, List.of(episode));

        assertEquals(List.of(episode), store.episodesOf(7));
        store.replaceEpisodes(7, List.of());
        assertEquals(List.of(), store.episodesOf(7));
    }

    @Test
    void jdbcStoreReadsAndReplacesRows() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        JdbcAnimeMediaStore store = new JdbcAnimeMediaStore(jdbc, new ObjectMapper(), "sanye_anime");
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            RowMapper<AnimeEpisode> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("id")).thenReturn(1L);
            when(rs.getInt("episode_no")).thenReturn(1);
            when(rs.getString("title")).thenReturn("第 1 集");
            when(rs.getString("source_page_url")).thenReturn("https://example.com/p/1");
            when(rs.getString("playback_url")).thenReturn("https://player.example/1");
            when(rs.getString("mime_type")).thenReturn("application/vnd.apple.mpegurl");
            when(rs.getString("source_label")).thenReturn("测试");
            when(rs.getString("playback_options_json")).thenReturn("["
                    + "{\"url\":\"https://player.example/1\",\"mimeType\":\"application/vnd.apple.mpegurl\",\"label\":\"主线路\"},"
                    + "{\"url\":\"https://backup.example/1\",\"mimeType\":\"application/vnd.apple.mpegurl\",\"label\":\"备用线路\"}]");
            return List.of(mapper.mapRow(rs, 0));
        });

        AnimeEpisode restored = store.episodesOf(7).get(0);
        assertEquals(2, restored.playbackOptions().size());
        assertEquals("https://backup.example/1", restored.playbackOptions().get(1).url());
        store.replaceEpisodes(7, List.of(episode(1), episode(2)));

        verify(jdbc).update(anyString(), anyLong());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Object[]>> batch = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(anyString(), batch.capture());
        assertTrue(String.valueOf(batch.getValue().get(0)[7]).contains("backup.example"));
    }

    private AnimeEpisode episode(int no) {
        return new AnimeEpisode(no, no, "第 " + no + " 集", "https://example.com/p/" + no,
                "https://player.example/" + no, "text/html", "测试",
                List.of(new AnimePlaybackOption("https://player.example/" + no, "text/html", "主线路"),
                        new AnimePlaybackOption("https://backup.example/" + no, "text/html", "备用线路")));
    }
}
