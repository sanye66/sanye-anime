package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import com.sanye.anime.sanye_ai_chat.store.ConversationStore;
import com.sanye.anime.sanye_ai_chat.store.PreferenceStore;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 会话记忆管理（LangChain4j ChatMemory）：每个会话保留最近 20 条消息，
 * 底层由 ChatMemoryStore（默认 PG，AI_MEMORY_STORE=memory 时内存）持久化（T-E-01）。
 * 上下文长度偏好（T-D-05）映射为记忆窗口大小：4096→10 条、8192→20 条、16384→30 条。
 */
@Component
public class ChatMemoryManager {

    private static final int DEFAULT_MAX_MESSAGES = 20;

    private final ChatMemoryStore chatMemoryStore;
    private final ConversationStore conversationStore;
    private final PreferenceStore preferenceStore;
    private final Map<Long, ChatMemory> memoryByConversation = new ConcurrentHashMap<>();

    /** 注入记忆持久化、会话归属和偏好存储组件。 */
    public ChatMemoryManager(ChatMemoryStore chatMemoryStore, ConversationStore conversationStore,
                             PreferenceStore preferenceStore) {
        this.chatMemoryStore = chatMemoryStore;
        this.conversationStore = conversationStore;
        this.preferenceStore = preferenceStore;
    }

    /** 按会话懒加载记忆窗口，并根据用户偏好决定最大消息数。 */
    public ChatMemory memory(Object conversationId) {
        Long id = conversationId instanceof Long value ? value : Long.valueOf(conversationId.toString());
        return memoryByConversation.computeIfAbsent(id,
                key -> MessageWindowChatMemory.builder()
                        .id(id)
                        .maxMessages(maxMessagesFor(id))
                        .chatMemoryStore(chatMemoryStore)
                        .build());
    }

    /** 偏好变更后清理该归属人的记忆缓存，确保新窗口下次生效。 */
    public void rebuildForOwner(String ownerKey) {
        conversationStore.conversationIdsOf(ownerKey)
                .forEach(memoryByConversation::remove);
    }

    /** 将上下文长度偏好映射到消息窗口，读取失败时使用默认值。 */
    private int maxMessagesFor(long conversationId) {
        try {
            String ownerKey = conversationStore.ownerOf(conversationId);
            Integer contextLength = preferenceStore.get(ownerKey)
                    .map(PreferenceStore.Preference::contextLength)
                    .orElse(null);
            if (contextLength == null) {
                return DEFAULT_MAX_MESSAGES;
            }
            return switch (contextLength) {
                case 4096 -> 10;
                case 16384 -> 30;
                default -> DEFAULT_MAX_MESSAGES;
            };
        } catch (RuntimeException ex) {
            // 会话不存在或偏好读取失败时使用默认窗口，不阻塞对话
            return DEFAULT_MAX_MESSAGES;
        }
    }

    /** 返回当前会话记忆中的消息。 */
    public List<ChatMessage> messages(long conversationId) {
        return memory(conversationId).messages();
    }

    /** 向会话记忆追加用户消息。 */
    public void addUser(long conversationId, String text) {
        memory(conversationId).add(dev.langchain4j.data.message.UserMessage.from(text));
    }

    /** 向会话记忆追加助手消息。 */
    public void addAssistant(long conversationId, String text) {
        memory(conversationId).add(new dev.langchain4j.data.message.AiMessage(text));
    }

    /** 清理会话记忆缓存及底层消息。 */
    public void clear(long conversationId) {
        ChatMemory memory = memoryByConversation.remove(conversationId);
        if (memory != null) {
            memory.clear();
        }
    }

}
