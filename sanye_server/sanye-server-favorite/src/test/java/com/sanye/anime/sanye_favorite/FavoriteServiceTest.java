package com.sanye.anime.sanye_favorite;

import com.sanye.anime.sanye_favorite.client.AnimeBrief;
import com.sanye.anime.sanye_favorite.client.AnimeClient;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.web.ApiResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FavoriteServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AnimeClient animeClient = mock(AnimeClient.class);
    private final FavoriteService service = new FavoriteService(jdbc, animeClient, "sanye_favorite");

    private static final AnimeBrief STAR_SEA = new AnimeBrief(1, "星海回声", "城市回声", "原创动画",
            2025, 9.2, "已发布", "/covers/anime-1.svg", List.of("科幻"), "周三 22:00 更新");

    @BeforeEach
    void setUp() {
        when(animeClient.getAnime(1L)).thenReturn(new ApiResponse<>(0, "ok", STAR_SEA, "rid"));
    }

    @Test
    void addRejectsUnknownAnime() {
        when(animeClient.getAnime(999L)).thenReturn(new ApiResponse<>(2003, "不存在", null, "rid"));
        assertThrows(BusinessException.class, () -> service.add("device:d1", 999L));
    }

    @Test
    void addCallsJdbcUpdate() {
        service.add("device:d1", 1L);
        verify(jdbc, org.mockito.Mockito.times(1)).update(anyString(), eq("device:d1"), eq(1L));
    }

    @Test
    void removeCallsJdbcUpdate() {
        service.remove("device:d1", 1L);
        verify(jdbc, org.mockito.Mockito.times(1)).update(anyString(), eq("device:d1"), eq(1L));
    }

    @Test
    void isFavoriteReflectsCount() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(1);
        assertTrue(service.isFavorite("device:d1", 1L));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
        assertFalse(service.isFavorite("device:d1", 1L));
    }

    @Test
    void recordHistoryUpserts() {
        service.recordHistory("device:d1", 1L);
        verify(jdbc).update(anyString(), eq("device:d1"), eq(1L));
    }

    @Test
    void ownerKeyUsesUserWhenLoggedIn() {
        assertEquals("user:7", OwnerKeys.of(new AuthContext.Context(7L, "device-x", false)));
    }

    @Test
    void ownerKeyUsesDeviceWhenAnonymous() {
        assertEquals("device:abc", OwnerKeys.of(new AuthContext.Context(null, "abc", true)));
    }

    @Test
    void ownerKeyRejectsMissingDevice() {
        assertThrows(BusinessException.class, () -> OwnerKeys.of(new AuthContext.Context(null, null, true)));
    }

    @Test
    void nonPositiveAnimeIdRejected() {
        assertThrows(BusinessException.class, () -> service.add("device:d1", 0));
        assertThrows(BusinessException.class, () -> service.remove("device:d1", -1));
        assertThrows(BusinessException.class, () -> service.isFavorite("device:d1", 0));
        assertThrows(BusinessException.class, () -> service.recordHistory("device:d1", -5));
    }

    @Test
    void listMapsRowsWithRemoteAnime() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any())).thenReturn(1L);
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),
                any(), any(), any())).thenAnswer(inv -> {
            RowMapper<?> mapper = inv.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("anime_id")).thenReturn(1L);
            when(rs.getTimestamp("created_at")).thenReturn(Timestamp.valueOf("2026-08-18 00:00:00"));
            return List.of(mapper.mapRow(rs, 0));
        });
        var result = service.list("device:d1", 1, 20);
        assertEquals(1, result.total());
        assertEquals("星海回声", result.items().get(0).anime().title());
        assertEquals("2026-08-17T16:00:00Z", result.items().get(0).createdAt());
    }

    @Test
    void historyMapsRowsWithRemoteAnime() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any())).thenReturn(1L);
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),
                any(), any(), any())).thenAnswer(inv -> {
            RowMapper<?> mapper = inv.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("anime_id")).thenReturn(1L);
            when(rs.getTimestamp("last_view_at")).thenReturn(Timestamp.valueOf("2026-08-18 00:00:00"));
            return List.of(mapper.mapRow(rs, 0));
        });
        var result = service.history("device:d1", 1, 20);
        assertEquals(1, result.total());
        assertEquals("星海回声", result.items().get(0).anime().title());
        assertEquals("2026-08-17T16:00:00Z", result.items().get(0).lastViewAt());
    }
}
