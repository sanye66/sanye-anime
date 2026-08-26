package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.ai.AnswerStreamer;
import com.sanye.anime.sanye_ai_chat.ai.GenerationRegistry;
import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.quota.QuotaService;
import com.sanye.anime.sanye_ai_chat.store.ConversationStore;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConversationServiceValidationTest {

    private final ConversationStore conversationStore = mock(ConversationStore.class);
    private final QuotaService quotaService = mock(QuotaService.class);
    private final AnswerStreamer answerStreamer = mock(AnswerStreamer.class);
    private final GenerationRegistry generationRegistry = mock(GenerationRegistry.class);
    private final ConversationService service =
            new ConversationService(conversationStore, quotaService, answerStreamer, generationRegistry);

    @BeforeEach
    void setUp() {
        AuthContext.set(new AuthContext.Context(null, "device-test", true));
        when(conversationStore.create(anyString(), anyString(), anyString(), any()))
                .thenReturn(new ConversationView(1, "新会话", "ACTIVE", "SAFE", null, "", "t", "t"));
    }

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void oversizedTitleRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("x".repeat(51), "SAFE", 1L));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void nonPositiveContextAnimeRejected() {
        assertThrows(BusinessException.class, () -> service.create("标题", "SAFE", 0L));
        assertThrows(BusinessException.class, () -> service.create("标题", "SAFE", -3L));
    }

    @Test
    void invalidSpoilerModeRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("标题", "STRANGE", 1L));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void validCreatePasses() {
        ConversationView view = service.create("标题", "SAFE", 1L);
        assertEquals(1L, view.id());
        assertEquals("新会话", view.title());
        assertEquals("SAFE", view.spoilerMode());
    }

    @Test
    void nullAnimeIdAllowed() {
        service.create("标题", "SAFE", null);
        org.mockito.Mockito.verify(conversationStore).create(anyString(), anyString(), anyString(), any());
    }

}
