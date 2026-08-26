package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
    void jdbcStoreReadsAndReplacesRows() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        JdbcAnimeMediaStore store = new JdbcAnimeMediaStore(jdbc, "sanye_anime");
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of(episode(1)));

        assertEquals(1, store.episodesOf(7).size());
        store.replaceEpisodes(7, List.of(episode(1), episode(2)));

        verify(jdbc).update(anyString(), anyLong());
        verify(jdbc).batchUpdate(anyString(), org.mockito.ArgumentMatchers.<List<Object[]>>any());
    }

    private AnimeEpisode episode(int no) {
        return new AnimeEpisode(no, no, "第 " + no + " 集", "https://example.com/p/" + no,
                "https://player.example/" + no, "text/html", "测试");
    }
}
