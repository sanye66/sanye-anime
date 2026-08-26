package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.ai.AnswerStreamer;
import com.sanye.anime.sanye_ai_chat.ai.GenerationRegistry;
import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_ai_chat.quota.QuotaService;
import com.sanye.anime.sanye_ai_chat.store.ConversationStore;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.PageResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

class ConversationServiceCrudTest {

    private final ConversationStore conversationStore = mock(ConversationStore.class);
    private final QuotaService quotaService = mock(QuotaService.class);
    private final AnswerStreamer answerStreamer = mock(AnswerStreamer.class);
    private final GenerationRegistry generationRegistry = mock(GenerationRegistry.class);
    private final ConversationService service =
            new ConversationService(conversationStore, quotaService, answerStreamer, generationRegistry);

    @BeforeEach
    void setUp() {
        AuthContext.set(new AuthContext.Context(null, "device-test", true));
    }

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void listDelegatesWithOwnerKeyAndPagination() {
        ConversationView view = new ConversationView(1, "会话", "ACTIVE", "SAFE", null, "", "t", "t");
        when(conversationStore.list(eq("device:device-test"), anyInt(), anyInt())).thenReturn(List.of(view));
        when(conversationStore.count("device:device-test")).thenReturn(1L);

        PageResult<ConversationView> result = service.list(1, 20);

        assertEquals(1, result.total());
        assertEquals(1, result.items().size());
        verify(conversationStore).count("device:device-test");
    }

    @Test
    void getUpdateDeleteDelegate() {
        ConversationView view = new ConversationView(1, "会话", "ACTIVE", "SAFE", null, "", "t", "t");
        when(conversationStore.get("device:device-test", 1L)).thenReturn(view);
        when(conversationStore.update(eq("device:device-test"), eq(1L), eq("新标题"), eq("ALLOW"),
                eq(null), eq(null))).thenReturn(view);

        assertEquals(1L, service.get(1L).id());
        assertEquals(1L, service.update(1L, "新标题", "ALLOW", null, null).id());
        service.delete(1L);
        verify(conversationStore).delete("device:device-test", 1L);
    }

    @Test
    void quotaDelegates() {
        when(quotaService.info("device:device-test", true))
                .thenReturn(new QuotaInfoView(2, 5, "2026-08-19T00:00", true));
        QuotaInfoView quota = service.quota();
        assertEquals(2, quota.used());
        assertEquals(5, quota.limit());
    }

    @Test
    void sendMessageValidPathStreams() {
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(true);
        when(conversationStore.userMessageIdByClientKey(1L, "cm-1")).thenReturn(0L);
        when(quotaService.reserve("device:device-test", true)).thenReturn(new QuotaInfoView(1, 5, "t", true));
        when(conversationStore.createAssistantMessage("device:device-test", 1L, "cm-1", 1)).thenReturn(7L);
        when(conversationStore.get("device:device-test", 1L))
                .thenReturn(new ConversationView(1, "t", "ACTIVE", "SAFE", 1L, "", "t", "t"));

        SseEmitter emitter = service.sendMessage(1L, "帮我推荐动漫", "cm-1", "SAFE");

        assertNotNull(emitter);
        verify(answerStreamer).stream(eq(1L), eq(7L), eq("帮我推荐动漫"), eq("SAFE"), eq(1L),
                eq("device:device-test"), eq(true), any(SseEmitter.class));
    }

    @Test
    void sendMessageReplaysIdempotentWithoutNewMessage() {
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(true);
        when(conversationStore.userMessageIdByClientKey(1L, "cm-1")).thenReturn(3L);
        when(conversationStore.messages("device:device-test", 1L, 3L)).thenReturn(List.of());

        SseEmitter emitter = service.sendMessage(1L, "你好", "cm-1", "SAFE");

        assertNotNull(emitter);
        verify(conversationStore, never()).createAssistantMessage(anyString(), anyLong(), anyString(), anyInt());
    }

    @Test
    void replayReadsCurrentQuotaWithoutReservingAgain() {
        MessageView assistant = new MessageView(7L, 1L, "ASSISTANT", "回答", "COMPLETED", 1,
                List.of(), "t");
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(true);
        when(conversationStore.userMessageIdByClientKey(1L, "cm-replay")).thenReturn(3L);
        when(conversationStore.messages("device:device-test", 1L, 3L)).thenReturn(List.of(assistant));
        when(quotaService.info("device:device-test", true))
                .thenReturn(new QuotaInfoView(1, 5, "t", true));

        SseEmitter emitter = service.sendMessage(1L, "你好", "cm-replay", "SAFE");

        assertNotNull(emitter);
        verify(quotaService).info("device:device-test", true);
        verify(quotaService, never()).reserve(anyString(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void sendMessageRejectsWhenNotOwner() {
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(false);

        SseEmitter emitter = service.sendMessage(1L, "你好", "cm-1", "SAFE");

        assertNotNull(emitter);
        verify(conversationStore, never()).addUserMessage(anyString(), anyLong(), anyString(), anyString(), anyString());
    }

    @Test
    void sendMessageReturnsFailedEventOnQuotaExhausted() {
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(true);
        when(conversationStore.userMessageIdByClientKey(1L, "cm-1")).thenReturn(0L);
        when(quotaService.reserve("device:device-test", true))
                .thenThrow(new com.sanye.anime.sanye_core.exception.BusinessException(
                        com.sanye.anime.sanye_core.exception.ErrorCode.QUOTA_EXHAUSTED));

        SseEmitter emitter = service.sendMessage(1L, "你好", "cm-1", "SAFE");

        assertNotNull(emitter);
        verify(conversationStore, never()).addUserMessage(anyString(), anyLong(), anyString(), anyString(), anyString());
    }

    @Test
    void stopChecksMessageOwnershipBeforeSettingStopFlag() {
        MessageView message = new MessageView(7L, 1L, "ASSISTANT", "", "GENERATING", 1, List.of(), "t");
        when(conversationStore.getMessageByOwnerAndId("device:device-test", 7L)).thenReturn(message);

        service.stop(7L);

        verify(generationRegistry).requestStop(7L);
    }

    @Test
    void stopRejectsMessageOwnedByAnotherDevice() {
        when(conversationStore.getMessageByOwnerAndId("device:device-test", 99L))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND));

        assertThrows(BusinessException.class, () -> service.stop(99L));

        verify(generationRegistry, never()).requestStop(99L);
    }

    @Test
    void invalidSpoilerModeIsRejectedBeforeGeneration() {
        when(conversationStore.belongsToOwner("device:device-test", 1L)).thenReturn(true);
        when(conversationStore.userMessageIdByClientKey(1L, "cm-invalid")).thenReturn(0L);

        SseEmitter emitter = service.sendMessage(1L, "你好", "cm-invalid", "STRANGE");

        assertNotNull(emitter);
        verify(quotaService, never()).reserve(anyString(), org.mockito.ArgumentMatchers.anyBoolean());
        verify(conversationStore, never()).addUserMessage(anyString(), anyLong(), anyString(), anyString(), anyString());
    }
}
