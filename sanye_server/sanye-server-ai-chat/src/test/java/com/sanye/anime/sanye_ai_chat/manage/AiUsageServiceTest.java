package com.sanye.anime.sanye_ai_chat.manage;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

class AiUsageServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    @Test
    void summaryQualifiesTrendDayColumn() {
        when(jdbc.queryForObject(anyString(), eq(Long.class))).thenReturn(0L);
        when(jdbc.query(anyString(), any(RowMapper.class))).thenReturn(List.of());

        new AiUsageService(jdbc, "sanye_ai_chat", "gpt-4o-mini", 0.12, 0.36).summary();

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class));
        String sql = sqlCaptor.getValue();
        assertTrue(sql.contains("to_char(days.day"));
        assertTrue(sql.contains("generate_series") && sql.contains("days(day)"));
        assertTrue(sql.contains("order by days.day"));
    }
}
