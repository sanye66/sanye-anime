package com.sanye.anime.sanye_ai_chat.ai;

import com.sanye.anime.sanye_ai_chat.store.InMemoryConversationStore;
import com.sanye.anime.sanye_ai_chat.store.InMemoryPreferenceStore;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatMemoryManagerTest {

    private final InMemoryConversationStore conversationStore = new InMemoryConversationStore();
    private final InMemoryPreferenceStore preferenceStore = new InMemoryPreferenceStore();
    private final ChatMemoryManager manager = new ChatMemoryManager(
            new InMemoryChatMemoryStore(), conversationStore, preferenceStore);

    private long createConversation(String ownerKey) {
        return conversationStore.create(ownerKey, "测试会话", "SAFE", null).id();
    }

    private void fillMessages(long conversationId, int rounds) {
        for (int i = 0; i < rounds; i++) {
            manager.addUser(conversationId, "问题" + i);
            manager.addAssistant(conversationId, "回答" + i);
        }
    }

    @Test
    void memoryPersistsMessagesPerConversation() {
        long first = createConversation("device:t1");
        long second = createConversation("device:t1");
        manager.addUser(first, "帮我推荐动漫");
        manager.addAssistant(first, "我推荐《纸月计划》。");
        List<ChatMessage> messages = manager.messages(first);
        assertEquals(2, messages.size());
        assertEquals("USER", messages.get(0).type().name());
        assertEquals("AI", messages.get(1).type().name());

        assertTrue(manager.messages(second).isEmpty(), "不同会话记忆隔离");
    }

    @Test
    void clearRemovesMemory() {
        long conversationId = createConversation("device:t1");
        manager.addUser(conversationId, "你好");
        manager.clear(conversationId);
        assertTrue(manager.messages(conversationId).isEmpty());
    }

    @Test
    void preferenceContextLengthControlsMemoryWindow() {
        long conversationId = createConversation("device:pref");
        preferenceStore.save("device:pref", 0.5, 4096, null, Instant.now());
        fillMessages(conversationId, 12);
        assertEquals(10, manager.messages(conversationId).size(), "4096 偏好应限制记忆窗口为 10 条");
    }

    @Test
    void preferenceChangeRebuildsWindow() {
        long conversationId = createConversation("device:pref2");
        preferenceStore.save("device:pref2", 0.5, 16384, null, Instant.now());
        fillMessages(conversationId, 12);
        assertEquals(24, manager.messages(conversationId).size(), "16384 偏好保留最近 30 条内的全部消息");

        preferenceStore.save("device:pref2", 0.5, 4096, null, Instant.now());
        manager.rebuildForOwner("device:pref2");
        manager.addUser(conversationId, "新问题");
        manager.addAssistant(conversationId, "新回答");
        assertEquals(10, manager.messages(conversationId).size(), "偏好变更后按新窗口收敛");
    }
}
