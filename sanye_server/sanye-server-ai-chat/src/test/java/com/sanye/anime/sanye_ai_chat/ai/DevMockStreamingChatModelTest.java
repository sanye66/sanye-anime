package com.sanye.anime.sanye_ai_chat.ai;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

class DevMockStreamingChatModelTest {

    private final DevMockStreamingChatModel model = new DevMockStreamingChatModel();
    private final SafetyRules safetyRules = new SafetyRules();

    @Test
    void spoilerQuestionDoesNotLeakInSafeContext() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> finalAnswer = new AtomicReference<>("");
        AtomicReference<Throwable> error = new AtomicReference<>();

        ChatRequest request = ChatRequest.builder()
                .messages(List.of(UserMessage.from("星海回声的结局是什么")))
                .build();
        model.chat(request, new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String partialResponse) {
                // 增量暂存
            }

            @Override
            public void onCompleteResponse(ChatResponse completeResponse) {
                AiMessage aiMessage = completeResponse.aiMessage();
                finalAnswer.set(aiMessage == null ? "" : aiMessage.text());
                latch.countDown();
            }

            @Override
            public void onError(Throwable throwable) {
                error.set(throwable);
                latch.countDown();
            }
        });

        assertTrue(latch.await(10, TimeUnit.SECONDS));
        if (error.get() != null) {
            throw new AssertionError(error.get());
        }
        String answer = finalAnswer.get();
        assertNotNull(answer);
        assertFalse(answer.isEmpty());
        String sanitized = safetyRules.sanitizeAnswer("星海回声的结局是什么", answer, "SAFE");
        assertEquals(answer, sanitized, "本地模拟回答不应触发剧透泄露替换");
        assertFalse(answer.contains("结局就是"), "不得泄露具体结局");
        assertFalse(answer.contains("结局是主角"));
        assertFalse(answer.contains("凶手是"));
    }

    @Test
    void streamingEmitsPartialAndComplete() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        int[] partials = {0};
        AtomicReference<Throwable> error = new AtomicReference<>();

        ChatRequest request = ChatRequest.builder()
                .messages(List.of(UserMessage.from("推荐一些好看的动漫")))
                .build();
        model.chat(request, new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String partialResponse) {
                partials[0]++;
            }

            @Override
            public void onCompleteResponse(ChatResponse completeResponse) {
                latch.countDown();
            }

            @Override
            public void onError(Throwable throwable) {
                error.set(throwable);
                latch.countDown();
            }
        });

        assertTrue(latch.await(10, TimeUnit.SECONDS));
        if (error.get() != null) {
            throw new AssertionError(error.get());
        }
        assertTrue(partials[0] > 0, "应产生多个流式增量");
    }
}
