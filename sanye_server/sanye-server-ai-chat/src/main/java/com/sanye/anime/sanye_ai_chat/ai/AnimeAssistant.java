package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * AiServices 助手接口（T-E-01）：流式回答 + 会话记忆（ChatMemoryProvider 自动读写）。
 * 剧透规则通过模板变量注入，安全拒答与输出二次校验在 T-E-04 完善。
 */
public interface AnimeAssistant {

    @SystemMessage("你是 sanye_anime 的三叶助手，专注动漫推荐与内容讲解。{spoilerRule}")
    TokenStream stream(@MemoryId Long memoryId, @UserMessage String userMessage, @V("spoilerRule") String spoilerRule);
}
