package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.model.chat.StreamingChatModel;

/**
 * 模型提供者抽象：默认 dev 本地模拟，配置 AI_API_KEY 后切换 OpenAI 兼容流式模型。
 * T-E-01 LangChain4j 集成基线在此接口上扩展模型适配层。
 */
public interface AiModelProvider {

    /**
     * 当前是否使用真实模型（配置了 API Key）。
     */
    boolean real();

    /** 返回当前环境实际启用的流式模型实例。 */
    StreamingChatModel streamingModel();
}
