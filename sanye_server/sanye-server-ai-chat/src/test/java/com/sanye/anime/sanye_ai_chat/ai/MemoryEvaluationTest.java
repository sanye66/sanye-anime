package com.sanye.anime.sanye_ai_chat.ai;

import com.sanye.anime.sanye_ai_chat.store.InMemoryConversationStore;
import com.sanye.anime.sanye_ai_chat.store.InMemoryPreferenceStore;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AI 会话记忆评测（T-E-02 扩展，T-G-04 记忆维度）：
 * 多轮记忆保留、偏好上下文长度映射记忆窗口、会话间隔离、窗口重建。
 */
class MemoryEvaluationTest {

    private final InMemoryConversationStore conversationStore = new InMemoryConversationStore();
    private final InMemoryPreferenceStore preferenceStore = new InMemoryPreferenceStore();
    private final InMemoryChatMemoryStore memoryStore = new InMemoryChatMemoryStore();
    private final ChatMemoryManager manager = new ChatMemoryManager(memoryStore, conversationStore, preferenceStore);

    private long conversationId;

    private static String textOf(ChatMessage message) {
        if (message instanceof UserMessage user) {
            return user.singleText();
        }
        if (message instanceof AiMessage ai) {
            return ai.text();
        }
        return "";
    }

    @BeforeEach
    void setUp() {
        conversationId = conversationStore.create("device:memory-eval", "记忆评测", "SAFE", null).id();
    }

    @Test
    void multiTurnMemoryKeepsRecentMessages() {
        // 默认窗口 20 条：12 轮（24 条）保留最近 20 条
        for (int i = 0; i < 12; i++) {
            manager.addUser(conversationId, "第 " + i + " 个问题");
            manager.addAssistant(conversationId, "第 " + i + " 个回答");
        }
        List<ChatMessage> messages = manager.messages(conversationId);
        assertEquals(20, messages.size(), "默认窗口保留最近 20 条");
        assertTrue(textOf(messages.get(0)).contains("第 2 个问题"), "最旧消息被淘汰");
        assertTrue(textOf(messages.get(messages.size() - 1)).contains("第 11 个回答"), "最新消息保留");
    }

    @Test
    void preferenceWindowControlsMemoryDepth() {
        preferenceStore.save("device:memory-eval", 0.5, 4096, null, Instant.now());
        for (int i = 0; i < 12; i++) {
            manager.addUser(conversationId, "问题" + i);
            manager.addAssistant(conversationId, "回答" + i);
        }
        assertEquals(10, manager.messages(conversationId).size(), "4096 偏好映射 10 条记忆窗口");
    }

    @Test
    void memoryIsIsolatedPerConversation() {
        long second = conversationStore.create("device:memory-eval", "另一会话", "SAFE", null).id();
        manager.addUser(conversationId, "会话一的问题");
        manager.addAssistant(conversationId, "会话一的回答");

        assertTrue(manager.messages(second).isEmpty(), "不同会话记忆隔离");
        assertEquals(2, manager.messages(conversationId).size());
        assertEquals("会话一的问题", textOf(manager.messages(conversationId).get(0)));
    }

    @Test
    void preferenceChangeRebuildsWindow() {
        preferenceStore.save("device:memory-eval", 0.5, 16384, null, Instant.now());
        for (int i = 0; i < 12; i++) {
            manager.addUser(conversationId, "问题" + i);
            manager.addAssistant(conversationId, "回答" + i);
        }
        assertEquals(24, manager.messages(conversationId).size(), "16384 保留全部");

        preferenceStore.save("device:memory-eval", 0.5, 4096, null, Instant.now());
        manager.rebuildForOwner("device:memory-eval");
        manager.addUser(conversationId, "新问题");
        manager.addAssistant(conversationId, "新回答");
        assertEquals(10, manager.messages(conversationId).size(), "偏好变更后收敛到 10 条");
    }

    @Test
    void assistantRepliesAreRemembered() {
        manager.addUser(conversationId, "我喜欢科幻");
        manager.addAssistant(conversationId, "那推荐《星海回声》。");
        ChatMemory memory = manager.memory(conversationId);
        long assistantCount = memory.messages().stream()
                .filter(m -> m.type().name().equals("AI")).count();
        assertNotEquals(0, assistantCount);
        assertTrue(memory.messages().stream().anyMatch(m -> textOf(m).contains("星海回声")));
    }
}
