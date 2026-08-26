package com.sanye.anime.sanye_feedback;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_feedback.model.AdminFeedbackView;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FeedbackServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final FeedbackService service = new FeedbackService(jdbc, "sanye_feedback");

    @Test
    void submitRejectsInvalidInput() {
        assertThrows(BusinessException.class, () -> service.submit("device-x", "乱写", "内容", null));
        assertThrows(BusinessException.class, () -> service.submit("device-x", "功能建议", " ", null));
        assertThrows(BusinessException.class, () -> service.submit("device-x", "功能建议", "x".repeat(1501), null));
    }

    @Test
    void submitPersists() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any()))
                .thenReturn(1L);
        long id = service.submit("device-x", "功能建议", "希望增加收藏列表导出", "a@example.com");
        assertEquals(1L, id);
        verify(jdbc).queryForObject(anyString(), eq(Long.class), any(), any(), any(), any());
    }

    @Test
    void updateStatusRejectsInvalid() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateStatus(1, "乱写", "admin"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void updateStatusUnknownReturnsNotFound() {
        when(jdbc.update(anyString(), any(), any(), eq(999L))).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.updateStatus(999, "处理中", "admin"));
    }

    @Test
    void listAllMapsRows() {
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<Object>>any())).thenAnswer(inv -> {
            RowMapper<?> mapper = inv.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("id")).thenReturn(1L);
            when(rs.getString("type")).thenReturn("功能建议");
            when(rs.getString("content")).thenReturn("希望增加收藏列表导出");
            when(rs.getString("contact")).thenReturn("a@example.com");
            when(rs.getString("device_key")).thenReturn("device-1234567890");
            when(rs.getString("priority")).thenReturn("中");
            when(rs.getString("status")).thenReturn("待处理");
            when(rs.getTimestamp("created_at")).thenReturn(Timestamp.valueOf("2026-08-18 10:00:00"));
            return List.of(mapper.mapRow(rs, 0));
        });
        List<AdminFeedbackView> rows = service.listAll();
        assertEquals(1, rows.size());
        assertEquals("希望增加收藏列表导出…".substring(0, 10), rows.get(0).title());
        assertEquals("device-1…", rows.get(0).user());
        assertEquals("待处理", rows.get(0).status());
        assertEquals("希望增加收藏列表导出", rows.get(0).content());
        assertEquals("a@example.com", rows.get(0).contact());
    }

    @Test
    void submitAcceptsAnimeImportRequest() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any()))
                .thenReturn(2L);
        long id = service.submit("device-x", "作品导入申请", "申请导入：https://example.com/p/900/", "");
        assertEquals(2L, id);
    }

    @Test
    void submitAcceptsAnimeImportRequestAlias() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), eq("作品导入申请"), any(), any()))
                .thenReturn(3L);
        long id = service.submit("device-x", "ANIME_IMPORT_REQUEST", "申请导入：https://example.com/p/900/", "");
        assertEquals(3L, id);
    }
}
