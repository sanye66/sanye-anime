package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 联调用本地模拟模型：按消息内容生成中文回答，逐句流式输出。
 * 仅用于无 AI_API_KEY 的开发联调，正式环境由 OpenAI 兼容模型替换。
 */
public class DevMockStreamingChatModel implements StreamingChatModel {

    private static final Logger log = LoggerFactory.getLogger(DevMockStreamingChatModel.class);
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "ai-mock-stream");
        thread.setDaemon(true);
        return thread;
    });

    /** 读取最后一条用户问题并逐句异步回调模拟回答。 */
    @Override
    public void chat(ChatRequest chatRequest, StreamingChatResponseHandler handler) {
        String lastUser = lastUserText(chatRequest.messages());
        List<String> retrievedTitles = retrievedTitles(chatRequest.messages());
        String answer = buildAnswer(lastUser, retrievedTitles);
        executor.submit(() -> {
            try {
                for (String sentence : splitSentences(answer)) {
                    handler.onPartialResponse(sentence);
                    Thread.sleep(180);
                }
                handler.onCompleteResponse(ChatResponse.builder()
                        .aiMessage(new AiMessage(answer))
                        .build());
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                handler.onError(ex);
            } catch (RuntimeException ex) {
                log.warn("本地模拟模型流式输出失败", ex);
                handler.onError(ex);
            }
        });
    }

    /** 从记忆消息中反向查找最近一条用户文本。 */
    private String lastUserText(List<ChatMessage> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage message = messages.get(i);
            if (message instanceof UserMessage userMessage && userMessage.singleText() != null) {
                return userMessage.singleText();
            }
        }
        return "";
    }

    /** 根据问题意图和 RAG 标题生成稳定的本地中文演示答案。 */
    private String buildAnswer(String question, List<String> retrievedTitles) {
        String text = question == null ? "" : question.trim();
        String answer;
        if (text.contains("推荐") || text.contains("相似") || text.contains("类似")
                || text.contains("有什么好看的") || text.contains("帮我找")
                || text.contains("有没有") || text.contains("适合")) {
            answer = "根据你的偏好，我推荐《无职转生 · 第一季》：从重新开始的人生出发，适合喜欢异世界冒险与角色成长的观众。"
                    + "另外《无职转生 · 第二季》也很适合你，它延续鲁迪乌斯的异世界旅程，适合关注伙伴关系和魔法冒险的观众。";
        } else if (text.contains("剧透") || text.contains("结局")) {
            answer = "这个问题涉及关键剧情。为了避免破坏你的观看体验，我可以在不剧透的范围内聊角色动机和主题。"
                    + "如果你想确认结局是否值得期待，我只能说这部作品的收尾和它的开篇一样用心。";
        } else {
            answer = "我收到了你的问题。我可以帮你找番、梳理剧情、解释角色关系，也可以根据题材、节奏和心情给你推荐作品。"
                    + "你可以告诉我更具体的偏好，比如类型、年代或者希望的氛围，我来帮你缩小范围。";
        }
        if (!retrievedTitles.isEmpty()) {
            answer += "（参考作品库资料：《" + String.join("》《", retrievedTitles) + "》。）";
        }
        return answer;
    }

    private static final Pattern TITLE_PATTERN = Pattern.compile("《([^》]{1,30})》");

    /** 从系统提示中的书名号内容提取最多三个检索标题。 */
    private List<String> retrievedTitles(List<ChatMessage> messages) {
        Set<String> titles = new LinkedHashSet<>();
        for (ChatMessage message : messages) {
            if (!(message instanceof SystemMessage systemMessage)) {
                continue;
            }
            Matcher matcher = TITLE_PATTERN.matcher(systemMessage.text());
            while (matcher.find() && titles.size() < 3) {
                titles.add(matcher.group(1));
            }
        }
        return new ArrayList<>(titles);
    }

    /** 按中文句末标点拆分文本，模拟模型逐句流式输出。 */
    private List<String> splitSentences(String text) {
        java.util.ArrayList<String> parts = new java.util.ArrayList<>();
        int start = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '。' || text.charAt(i) == '！' || text.charAt(i) == '？') {
                parts.add(text.substring(start, i + 1));
                start = i + 1;
            }
        }
        if (start < text.length()) {
            parts.add(text.substring(start));
        }
        if (parts.isEmpty()) {
            parts.add(text);
        }
        return parts;
    }
}
