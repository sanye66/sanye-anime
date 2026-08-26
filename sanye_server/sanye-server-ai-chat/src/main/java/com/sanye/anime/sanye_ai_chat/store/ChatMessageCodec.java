package com.sanye.anime.sanye_ai_chat.store;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;

/**
 * LangChain4j ChatMessage 与持久化列（role/content）互转（T-E-01）。
 * 联调基线只持久化文本消息；工具调用、图片等富内容在正式记忆接入时扩展。
 */
public final class ChatMessageCodec {

    /** 编解码工具类禁止实例化。 */
    private ChatMessageCodec() {
    }

    /** 将 LangChain4j 消息类型映射为数据库角色值。 */
    public static String roleOf(ChatMessage message) {
        return switch (message.type()) {
            case USER -> "USER";
            case AI -> "ASSISTANT";
            case SYSTEM -> "SYSTEM";
            default -> throw new IllegalArgumentException("不支持的记忆消息类型: " + message.type());
        };
    }

    /** 提取用户、助手或系统消息中的纯文本内容。 */
    public static String textOf(ChatMessage message) {
        if (message instanceof UserMessage userMessage) {
            return userMessage.singleText();
        }
        if (message instanceof AiMessage aiMessage) {
            return aiMessage.text();
        }
        if (message instanceof SystemMessage systemMessage) {
            return systemMessage.text();
        }
        throw new IllegalArgumentException("不支持的记忆消息类型: " + message.type());
    }

    /** 将数据库角色和正文还原为 LangChain4j 消息对象。 */
    public static ChatMessage messageOf(String role, String content) {
        return switch (role) {
            case "USER" -> UserMessage.from(content);
            case "ASSISTANT" -> new AiMessage(content);
            case "SYSTEM" -> SystemMessage.from(content);
            default -> throw new IllegalArgumentException("未知记忆消息角色: " + role);
        };
    }
}
