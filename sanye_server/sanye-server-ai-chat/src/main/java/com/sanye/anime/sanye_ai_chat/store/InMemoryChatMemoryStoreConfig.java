package com.sanye.anime.sanye_ai_chat.store;

import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 内存会话记忆实现（AI_MEMORY_STORE=memory 时使用，服务重启丢失）。
 */
@Configuration
@ConditionalOnProperty(name = "sanye.ai.memory-store", havingValue = "memory")
public class InMemoryChatMemoryStoreConfig {

    @Bean
    /** 创建开发/降级模式使用的进程内聊天记忆存储。 */
    public ChatMemoryStore chatMemoryStore() {
        return new InMemoryChatMemoryStore();
    }
}
