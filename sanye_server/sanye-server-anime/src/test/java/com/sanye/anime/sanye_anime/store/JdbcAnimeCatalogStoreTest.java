package com.sanye.anime.sanye_anime.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCard;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcAnimeCatalogStoreTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JdbcAnimeCatalogStore store = new JdbcAnimeCatalogStore(jdbc, objectMapper, "sanye_anime");

    private AnimeCard card(long id, String status) {
        return new AnimeCard(id, "星海回声", "城市回声", "原创动画", 2025, 9.2, status,
                "/covers/anime-" + id + ".svg", List.of("科幻", "冒险"), "周三 22:00 更新");
    }

    @Test
    void publishedCardsQueriesPublishedOnly() {
        when(jdbc.query(anyString(), any(RowMapper.class))).thenReturn(List.of(card(1, "已发布")));
        List<AnimeCard> cards = store.publishedCards();
        assertEquals(1, cards.size());
        assertEquals("星海回声", cards.get(0).title());
    }

    @Test
    void cardOfReturnsNullWhenMissing() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of());
        assertNull(store.cardOf(99));
    }

    @Test
    void addCardInsertsAndReturnsCard() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(16L);
        AnimeCard created = store.addCard("新番", "", "电视动画", 2026, "简介", List.of("测试"), "周三 20:00 更新", "草稿");
        assertNotNull(created);
        assertEquals(16L, created.id());
        assertEquals("草稿", created.status());
        assertEquals("/covers/anime-placeholder.svg", created.coverUrl());
    }

    @Test
    void addCardStoresSourceAndCover() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(17L);
        when(jdbc.update(anyString(), any(), anyLong())).thenReturn(1);

        AnimeCard created = store.addCard("导入作品", "Imported", "电视动画", 2026, "简介", List.of("测试"),
                "已完结", "草稿", "https://example.com/anime/17", "/admin-profile/profile/17.jpg");

        assertEquals("/admin-profile/profile/17.jpg", created.coverUrl());
    }

    @Test
    void replaceCardUpdatesWhenExists() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of(card(1, "已发布")));
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any(), any(), anyLong())).thenReturn(1);
        AnimeCard replaced = store.replaceCard(1, "新标题", "", "电视动画", 2026, "新简介",
                List.of("测试"), "周五 20:00 更新");
        assertNotNull(replaced);
        assertEquals("星海回声", replaced.title());
        verify(jdbc).update(anyString(), eq("新标题"), eq(""), eq("电视动画"), eq(2026), eq("新简介"),
                eq("周五 20:00 更新"), anyString(), eq(1L));
    }

    @Test
    void replaceCardReturnsNullWhenMissing() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of());
        assertNull(store.replaceCard(99, "标题", "", "电视动画", 2026, "", List.of(), ""));
    }

    @Test
    void replaceCardStoresSourceAndCover() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of(card(1, "已发布")));

        AnimeCard replaced = store.replaceCard(1, "新标题", "", "电视动画", 2026, "新简介",
                List.of("测试"), "已完结", "https://example.com/anime/1", "/admin-profile/profile/1.jpg");

        assertNotNull(replaced);
        assertEquals("星海回声", replaced.title());
    }

    @Test
    void updateStatusDelegates() {
        when(jdbc.update(anyString(), any(), anyLong())).thenReturn(1);
        store.updateStatus(1, "已下架");
        verify(jdbc).update(anyString(), eq("已下架"), eq(1L));
    }

    @Test
    void statusOfAndSummaryOfReadBack() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of("已发布"));
        assertEquals("已发布", store.statusOf(1));
        assertEquals("已发布", store.statusOf(1));
    }

    @Test
    void sourceOfReadsSourceUrl() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of("https://example.com/anime/1"));
        assertEquals("https://example.com/anime/1", store.sourceOf(1));
    }

    @Test
    void summaryByIdCollectsRows() {
        when(jdbc.query(anyString(), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of();
        });
        Map<Long, String> summaries = store.summaryById();
        assertNotNull(summaries);
        assertEquals(0, summaries.size());
    }

    @Test
    void detailOfReturnsNullWhenMissing() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of());
        assertNull(store.detailOf(99));
    }
}
