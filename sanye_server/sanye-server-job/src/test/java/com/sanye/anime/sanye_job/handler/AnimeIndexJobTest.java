package com.sanye.anime.sanye_job.handler;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_job.client.SearchClient;
import com.xxl.job.core.context.XxlJobContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AnimeIndexJobTest {
    private final SearchClient client = mock(SearchClient.class);
    private final AnimeIndexJob job = new AnimeIndexJob(client);
    private XxlJobContext context;

    @BeforeEach
    void setUp() {
        context = new XxlJobContext(1, "", "", 0, 1);
        XxlJobContext.setXxlJobContext(context);
    }

    @AfterEach
    void clear() {
        XxlJobContext.setXxlJobContext(null);
    }

    @Test
    void reportsCompletedRebuildIncludingEmptyIndex() {
        when(client.reindex()).thenReturn(ApiResponse.ok(Map.of("indexed", 3), "test"), ApiResponse.ok(Map.of("indexed", 0), "test"));
        job.rebuildAnimeIndex();
        assertEquals(200, context.getHandleCode());
        assertTrue(context.getHandleMsg().contains("indexed=3"));
        job.rebuildAnimeIndex();
        assertEquals(200, context.getHandleCode());
        assertTrue(context.getHandleMsg().contains("indexed=0"));
        verify(client, times(2)).reindex();
    }

    @Test
    void rejectsMissingAndInvalidBusinessResults() {
        when(client.reindex()).thenReturn(null, ApiResponse.error(403, "secret", "test"),
                ApiResponse.ok(null, "test"), ApiResponse.ok(Map.of("indexed", -1), "test"), ApiResponse.ok(Map.of(), "test"));
        for (int i = 0; i < 5; i++) {
            job.rebuildAnimeIndex();
            assertEquals(500, context.getHandleCode());
            assertFalse(context.getHandleMsg().contains("secret"));
        }
    }

    @Test
    void reportsRemoteFailureWithoutLeakingExceptionOrRetrying() {
        when(client.reindex()).thenThrow(new IllegalStateException("secret request token and response"));
        assertDoesNotThrow(job::rebuildAnimeIndex);
        assertEquals(500, context.getHandleCode());
        assertFalse(context.getHandleMsg().contains("secret"));
        verify(client).reindex();
    }
}
