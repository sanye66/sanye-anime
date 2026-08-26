package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * OpenAI 兼容流式模型提供者：读取 AI_API_KEY / AI_BASE_URL / AI_MODEL 环境变量。
 */
@Component
@ConditionalOnProperty(name = "sanye.ai.provider", havingValue = "openai")
public class OpenAiStreamingProvider implements AiModelProvider {

    private final StreamingChatModel model;

    /** 按环境配置构造 OpenAI 兼容模型，缺少 base URL 时使用供应商默认地址。 */
    public OpenAiStreamingProvider(
            @Value("${sanye.ai.api-key}") String apiKey,
            @Value("${sanye.ai.base-url:}") String baseUrl,
            @Value("${sanye.ai.model:gpt-4o-mini}") String modelName,
            @Value("${sanye.ai.temperature:0.7}") double temperature) {
        OpenAiStreamingChatModel.OpenAiStreamingChatModelBuilder builder = OpenAiStreamingChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                .temperature(temperature);
        if (baseUrl != null && !baseUrl.isBlank()) {
            builder.baseUrl(baseUrl);
        }
        this.model = builder.build();
    }

    /** 标识当前提供者是真实在线模型。 */
    @Override
    public boolean real() {
        return true;
    }

    /** 返回已按配置构造的 OpenAI 兼容流式模型。 */
    @Override
    public StreamingChatModel streamingModel() {
        return model;
    }
}
