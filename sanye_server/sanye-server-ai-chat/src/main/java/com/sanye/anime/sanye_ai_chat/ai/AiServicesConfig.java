package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.service.AiServices;
import dev.langchain4j.rag.DefaultRetrievalAugmentor;
import com.sanye.anime.sanye_ai_chat.rag.AnimeContentRetriever;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * AiServices 装配（T-E-01）：流式模型 + 会话记忆提供者（PG 持久化）。
 * RAG 检索（T-E-03）通过 contentRetriever 在此扩展。
 */
@Configuration
public class AiServicesConfig {

    /** 构造带流式模型、持久化记忆和 RAG 检索增强的动漫助手。 */
    @Bean
    public AnimeAssistant animeAssistant(AiModelProvider modelProvider, ChatMemoryManager chatMemoryManager,
                                         AnimeContentRetriever contentRetriever) {
        return AiServices.builder(AnimeAssistant.class)
                .streamingChatModel(modelProvider.streamingModel())
                .chatMemoryProvider(chatMemoryManager::memory)
                .retrievalAugmentor(DefaultRetrievalAugmentor.builder()
                        .contentRetriever(contentRetriever)
                        .build())
                .build();
    }
}
