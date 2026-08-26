package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.ai.ChatMemoryManager;
import com.sanye.anime.sanye_ai_chat.model.AiPreferenceView;
import com.sanye.anime.sanye_ai_chat.model.ModelInfoView;
import com.sanye.anime.sanye_ai_chat.store.InMemoryConversationStore;
import com.sanye.anime.sanye_ai_chat.store.InMemoryPreferenceStore;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiPreferenceServiceTest {

    private final InMemoryConversationStore conversationStore = new InMemoryConversationStore();
    private final InMemoryPreferenceStore preferenceStore = new InMemoryPreferenceStore();
    private final ChatMemoryManager chatMemoryManager = new ChatMemoryManager(
            new InMemoryChatMemoryStore(), conversationStore, preferenceStore);
    private final AiPreferenceService service = new AiPreferenceService(
            preferenceStore, chatMemoryManager, "dev", "gpt-4o-mini", 0.7, "pg", "pg");

    @BeforeEach
    void setUp() {
        AuthContext.set(new AuthContext.Context(null, "device-pref-test", true));
    }

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void getWithoutPreferenceReturnsNulls() {
        AiPreferenceView view = service.get();
        assertNull(view.temperature());
        assertNull(view.contextLength());
        assertNull(view.modelName());
    }

    @Test
    void saveAndGetRoundTrip() {
        AiPreferenceView saved = service.save(0.3, 4096, "gpt-4o-mini");
        assertEquals(0.3, saved.temperature());
        assertEquals(4096, saved.contextLength());
        assertEquals("gpt-4o-mini", saved.modelName());

        AiPreferenceView loaded = service.get();
        assertEquals(0.3, loaded.temperature());
        assertEquals(4096, loaded.contextLength());
        assertEquals("gpt-4o-mini", loaded.modelName());
    }

    @Test
    void blankModelNameStoredAsNull() {
        AiPreferenceView saved = service.save(0.5, null, "  ");
        assertNull(saved.modelName());
        assertNull(saved.contextLength());
    }

    @Test
    void invalidTemperatureRejected() {
        assertThrows(BusinessException.class, () -> service.save(1.5, null, null));
        assertThrows(BusinessException.class, () -> service.save(-0.1, null, null));
    }

    @Test
    void invalidContextLengthRejected() {
        assertThrows(BusinessException.class, () -> service.save(null, 2048, null));
    }

    @Test
    void overlongModelNameRejected() {
        assertThrows(BusinessException.class, () -> service.save(null, null, "x".repeat(51)));
    }

    @Test
    void modelInfoReturnsServerConfigWithoutSecrets() {
        ModelInfoView info = service.modelInfo();
        assertEquals("dev", info.provider());
        assertEquals("gpt-4o-mini", info.model());
        assertEquals(0.7, info.temperature());
        assertTrue(info.ragEnabled());
        assertTrue(info.safetyEnabled());
        assertEquals(3, info.allowedContextLengths().size());
        assertTrue(info.allowedContextLengths().contains(8192));
    }

    @Test
    void saveRebuildsMemoryWindowForOwnerConversations() {
        long conversationId = conversationStore.create("device:device-pref-test", "会话", "SAFE", null).id();
        service.save(0.5, 16384, null);
        for (int i = 0; i < 12; i++) {
            chatMemoryManager.addUser(conversationId, "问题" + i);
            chatMemoryManager.addAssistant(conversationId, "回答" + i);
        }
        assertEquals(24, chatMemoryManager.messages(conversationId).size(), "16384 保留最近 30 条内的全部消息");

        service.save(0.5, 4096, null);
        chatMemoryManager.addUser(conversationId, "新问题");
        chatMemoryManager.addAssistant(conversationId, "新回答");
        assertEquals(10, chatMemoryManager.messages(conversationId).size(), "保存后重建记忆窗口为 10 条");
    }
}
