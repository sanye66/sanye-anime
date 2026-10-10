package com.sanye.anime.sanye_search;

import com.sanye.anime.sanye_core.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SearchControllerSecurityTest {

    private final SearchService searchService = mock(SearchService.class);
    private final AnimeIndexService indexService = mock(AnimeIndexService.class);
    private final ExternalSearchService externalSearchService = mock(ExternalSearchService.class);
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final SearchController controller = new SearchController(
            searchService, indexService, externalSearchService, request);

    @BeforeEach
    void configureInternalToken() {
        ReflectionTestUtils.setField(controller, "internalToken", "search-task-token");
    }

    @Test
    void reindexRejectsMissingAndIncorrectInternalCredentials() throws Exception {
        BusinessException missing = assertThrows(BusinessException.class, controller::reindex);
        assertEquals(2002, missing.errorCode().code());

        when(request.getHeader("X-Caller-Name")).thenReturn("sanye-server-job");
        when(request.getHeader("X-Internal-Token")).thenReturn("incorrect-token");
        BusinessException incorrect = assertThrows(BusinessException.class, controller::reindex);
        assertEquals(2002, incorrect.errorCode().code());
        verify(indexService, never()).ensureIndex();
        verify(indexService, never()).syncAll();
    }
}
