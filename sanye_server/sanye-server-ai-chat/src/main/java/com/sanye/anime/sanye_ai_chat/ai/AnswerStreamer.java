package com.sanye.anime.sanye_ai_chat.ai;

import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_ai_chat.model.SseEvents;
import com.sanye.anime.sanye_ai_chat.manage.AiUsageService;
import com.sanye.anime.sanye_ai_chat.monitor.AiMetrics;
import com.sanye.anime.sanye_ai_chat.quota.QuotaService;
import com.sanye.anime.sanye_ai_chat.store.ConversationStore;
import dev.langchain4j.model.chat.response.ChatResponse;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * 回答流式输出（T-E-01）：通过 AiServices（AnimeAssistant）生成，
 * 会话记忆由 ChatMemoryProvider 自动读写（默认 PG 持久化）；
 * 增量回调转换为 SSE 事件，支持停止标记与断线清理。
 */
@Component
public class AnswerStreamer {

    private static final Logger log = LoggerFactory.getLogger(AnswerStreamer.class);

    private final AnimeAssistant animeAssistant;
    private final GenerationRegistry generationRegistry;
    private final RecommendationExtractor recommendationExtractor;
    private final RecommendationParser recommendationParser;
    private final SafetyRules safetyRules;
    private final AiMetrics aiMetrics;
    private final ConversationStore conversationStore;
    private final QuotaService quotaService;
    private final ThreadPoolTaskExecutor aiGenerationExecutor;
    private final AiUsageService aiUsageService;

    /** 注入模型回调、持久化、额度、监控和线程池组件，组装流式生成生命周期。 */
    public AnswerStreamer(AnimeAssistant animeAssistant, GenerationRegistry generationRegistry,
                          RecommendationExtractor recommendationExtractor, RecommendationParser recommendationParser,
                          SafetyRules safetyRules, AiMetrics aiMetrics,
                          ConversationStore conversationStore, QuotaService quotaService,
                          ThreadPoolTaskExecutor aiGenerationExecutor, AiUsageService aiUsageService) {
        this.animeAssistant = animeAssistant;
        this.generationRegistry = generationRegistry;
        this.recommendationExtractor = recommendationExtractor;
        this.recommendationParser = recommendationParser;
        this.safetyRules = safetyRules;
        this.aiMetrics = aiMetrics;
        this.conversationStore = conversationStore;
        this.quotaService = quotaService;
        this.aiGenerationExecutor = aiGenerationExecutor;
        this.aiUsageService = aiUsageService;
    }

    /** 提交异步生成任务，将模型回调、持久化、SSE 事件和额度处理串成完整生命周期。 */
    public void stream(long conversationId, long assistantMessageId, String userText, String spoilerMode,
                       Long contextAnimeId, String ownerKey, boolean anonymous, SseEmitter emitter) {
        aiGenerationExecutor.submit(() -> {
            CountDownLatch latch = new CountDownLatch(1);
            long generationStartedAt = System.nanoTime();
            List<RecommendationView> recommendations = recommendationExtractor.extract(userText, contextAnimeId);
            boolean[] tokensEmitted = {false};
            boolean[] firstTokenRecorded = {false};
            Timer.Sample[] firstTokenSample = {null};
            try {
                generationRegistry.register(assistantMessageId);
                firstTokenSample[0] = aiMetrics.startFirstToken();
                send(emitter, SseEvents.MESSAGE_ACCEPTED, Map.of(
                        "messageId", assistantMessageId,
                        "conversationId", conversationId));

                String refusalKeyword = safetyRules.refusalReason(userText).orElse(null);
                if (refusalKeyword != null) {
                    aiMetrics.refused();
                    String refusalText = safetyRules.refusalText(refusalKeyword);
                    conversationStore.appendAssistantDelta(assistantMessageId, refusalText);
                    send(emitter, SseEvents.MESSAGE_DELTA, Map.of(
                            "messageId", assistantMessageId, "delta", refusalText));
                    conversationStore.completeMessage(assistantMessageId, "COMPLETED");
                    QuotaInfoView quota = quotaService.info(ownerKey, anonymous);
                    send(emitter, SseEvents.MESSAGE_COMPLETED, Map.of(
                            "messageId", assistantMessageId,
                            "status", "COMPLETED",
                            "quota", Map.of("used", quota.used(), "limit", quota.limit())));
                    emitter.complete();
                    return;
                }

                animeAssistant.stream(conversationId, userText, buildSpoilerRule(spoilerMode))
                        .onPartialResponse(delta -> {
                            if (delta == null || delta.isEmpty()) {
                                return;
                            }
                            tokensEmitted[0] = true;
                            if (!firstTokenRecorded[0]) {
                                firstTokenRecorded[0] = true;
                                aiMetrics.firstToken(firstTokenSample[0]);
                            }
                            if (!generationRegistry.isStopped(assistantMessageId)) {
                                conversationStore.appendAssistantDelta(assistantMessageId, delta);
                                send(emitter, SseEvents.MESSAGE_DELTA, Map.of(
                                        "messageId", assistantMessageId, "delta", delta));
                            }
                        })
                        .onCompleteResponse(completeResponse -> complete(conversationId, assistantMessageId,
                                recommendations, completeResponse, userText, spoilerMode, ownerKey, anonymous,
                                emitter, latch, generationStartedAt))
                        .onError(error -> fail(conversationId, assistantMessageId, ownerKey, anonymous, emitter, latch,
                                tokensEmitted[0], error))
                        .onRetrieved(retrieved -> {
                        })
                        .onToolExecuted(executed -> {
                        })
                        .start();

                if (!latch.await(3, TimeUnit.MINUTES)) {
                    log.warn("AI 生成超时 conversationId={} messageId={}", conversationId, assistantMessageId);
                    conversationStore.completeMessage(assistantMessageId, "FAILED");
                    if (!tokensEmitted[0]) {
                        quotaService.refund(ownerKey, anonymous);
                    }
                    send(emitter, SseEvents.MESSAGE_FAILED, Map.of(
                            "messageId", assistantMessageId,
                            "code", 4001,
                            "reason", "AI 响应超时，请稍后重试"));
                    emitter.complete();
                }
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                log.warn("AI 生成任务被中断 conversationId={} messageId={}", conversationId, assistantMessageId);
                conversationStore.completeMessage(assistantMessageId, "FAILED");
                if (!tokensEmitted[0]) {
                    quotaService.refund(ownerKey, anonymous);
                }
                send(emitter, SseEvents.MESSAGE_FAILED, Map.of(
                        "messageId", assistantMessageId,
                        "code", 4001,
                        "reason", "AI 响应中断，请稍后重试"));
                emitter.complete();
            } catch (RuntimeException ex) {
                log.error("AI 生成任务异常 conversationId={} messageId={}", conversationId, assistantMessageId, ex);
                conversationStore.completeMessage(assistantMessageId, "FAILED");
                if (!tokensEmitted[0]) {
                    quotaService.refund(ownerKey, anonymous);
                }
                send(emitter, SseEvents.MESSAGE_FAILED, Map.of(
                        "messageId", assistantMessageId,
                        "code", 5001,
                        "reason", "AI 服务内部错误"));
                emitter.complete();
            } finally {
                generationRegistry.clear(assistantMessageId);
                if (firstTokenSample[0] != null && !firstTokenRecorded[0]) {
                    aiMetrics.firstToken(firstTokenSample[0]);
                }
            }
        });
    }

    /** 处理模型完成回调，执行安全过滤、推荐落库、状态收敛和用量记录。 */
    private void complete(long conversationId, long assistantMessageId, List<RecommendationView> recommendations,
                          ChatResponse completeResponse, String userText, String spoilerMode, String ownerKey,
                          boolean anonymous, SseEmitter emitter, CountDownLatch latch, long generationStartedAt) {
        try {
            String answer = completeResponse.aiMessage() == null ? "" : completeResponse.aiMessage().text();
            if (answer == null || answer.isBlank()) {
                answer = conversationStore.getMessageByOwnerAndId(ownerKey, assistantMessageId).content();
            }
            String sanitized = safetyRules.sanitizeAnswer(userText, answer, spoilerMode);
            if (!sanitized.equals(answer)) {
                conversationStore.replaceMessageContent(assistantMessageId, sanitized);
            }
            List<RecommendationView> finalRecommendations = recommendations;
            if (finalRecommendations.isEmpty()) {
                finalRecommendations = recommendationParser.parse(answer);
                finalRecommendations = recommendationExtractor.verifyStrict(finalRecommendations);
            }
            if (!finalRecommendations.isEmpty()) {
                conversationStore.setRecommendations(assistantMessageId, finalRecommendations);
                send(emitter, SseEvents.RECOMMENDATION, Map.of(
                        "messageId", assistantMessageId,
                        "recommendations", finalRecommendations));
            }
            if (generationRegistry.isStopped(assistantMessageId)) {
                conversationStore.completeMessage(assistantMessageId, "STOPPED");
                send(emitter, SseEvents.MESSAGE_STOPPED, Map.of("messageId", assistantMessageId));
            } else {
                conversationStore.completeMessage(assistantMessageId, "COMPLETED");
                aiMetrics.completed();
                QuotaInfoView quota = quotaService.info(ownerKey, anonymous);
                send(emitter, SseEvents.MESSAGE_COMPLETED, Map.of(
                        "messageId", assistantMessageId,
                        "status", "COMPLETED",
                        "quota", Map.of("used", quota.used(), "limit", quota.limit())));
            }
            aiUsageService.record(assistantMessageId, completeResponse.modelName(), userText, sanitized,
                    (int) TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - generationStartedAt),
                    completeResponse.tokenUsage());
        } finally {
            emitter.complete();
            latch.countDown();
        }
    }

    /** 处理模型错误，更新失败状态并在没有输出 token 时退还额度。 */
    private void fail(long conversationId, long assistantMessageId, String ownerKey, boolean anonymous,
                      SseEmitter emitter, CountDownLatch latch, boolean tokensEmitted, Throwable error) {
        try {
            log.warn("AI 流式生成失败 conversationId={} messageId={} error={}",
                    conversationId, assistantMessageId, error.toString());
            aiMetrics.failed();
            conversationStore.completeMessage(assistantMessageId, "FAILED");
            if (!tokensEmitted) {
                quotaService.refund(ownerKey, anonymous);
            }
            send(emitter, SseEvents.MESSAGE_FAILED, Map.of(
                    "messageId", assistantMessageId,
                    "code", 4001,
                    "reason", "AI 服务暂不可用，请稍后重试"));
        } finally {
            emitter.complete();
            latch.countDown();
        }
    }

    /** 根据剧透模式组装发送给模型的安全约束。 */
    private String buildSpoilerRule(String spoilerMode) {
        if ("ALLOW".equals(spoilerMode)) {
            return "用户允许剧透，可以讨论关键剧情，但回答要简洁、有条理。";
        }
        return "默认避免剧透：不主动透露结局、反转或关键情节；用户明确询问结局时，提示可以先看完作品再讨论。\n"
                + safetyRules.rulesText();
    }

    /** 发送 SSE 事件；客户端断开时只记录调试日志并让生成流程自行收敛。 */
    private void send(SseEmitter emitter, String event, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(event).data(payload));
        } catch (IOException | IllegalStateException ex) {
            log.debug("SSE 发送中断 event={} error={}", event, ex.getMessage());
        }
    }
}
