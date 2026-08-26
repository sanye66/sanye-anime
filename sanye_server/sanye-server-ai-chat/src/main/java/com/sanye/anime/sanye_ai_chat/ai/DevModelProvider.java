package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.model.chat.StreamingChatModel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 本地模拟模型提供者（默认）：AI_PROVIDER=dev 或未配置 API Key 时使用。
 */
@Component
@ConditionalOnProperty(name = "sanye.ai.provider", havingValue = "dev", matchIfMissing = true)
public class DevModelProvider implements AiModelProvider {

    private final StreamingChatModel model = new DevMockStreamingChatModel();

    /** 标识当前为本地模拟模型，不消耗供应商额度。 */
    @Override
    public boolean real() {
        return false;
    }

    /** 返回进程内模拟流式模型。 */
    @Override
    public StreamingChatModel streamingModel() {
        return model;
    }
}
