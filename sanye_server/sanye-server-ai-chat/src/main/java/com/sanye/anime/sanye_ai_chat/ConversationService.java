package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.ai.AnswerStreamer;
import com.sanye.anime.sanye_ai_chat.ai.GenerationRegistry;
import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_ai_chat.model.SseEvents;
import com.sanye.anime.sanye_ai_chat.quota.QuotaService;
import com.sanye.anime.sanye_ai_chat.store.ConversationStore;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.PageResult;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * AI 会话编排：所有权校验（匿名按 X-Device-Id，登录按 userId）、额度预占与 SSE 生成。
 */
@Service
public class ConversationService {

    private final ConversationStore conversationStore;
    private final QuotaService quotaService;
    private final AnswerStreamer answerStreamer;
    private final GenerationRegistry generationRegistry;

    /** 注入会话存储、额度服务和生成器，集中编排 AI 对话生命周期。 */
    public ConversationService(ConversationStore conversationStore, QuotaService quotaService,
                               AnswerStreamer answerStreamer, GenerationRegistry generationRegistry) {
        this.conversationStore = conversationStore;
        this.quotaService = quotaService;
        this.answerStreamer = answerStreamer;
        this.generationRegistry = generationRegistry;
    }

    /** 按当前归属键查询会话分页并计算总数。 */
    public PageResult<ConversationView> list(int page, int size) {
        String ownerKey = ownerKey();
        List<ConversationView> items = conversationStore.list(ownerKey, page, size);
        long total = conversationStore.count(ownerKey);
        return PageResult.of(items, page, size, total);
    }

    /** 校验会话参数并创建属于当前用户/设备的新会话。 */
    public ConversationView create(String title, String spoilerMode, Long contextAnimeId) {
        String ownerKey = ownerKey();
        if (title != null && title.length() > 50) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "会话标题不能超过 50 字");
        }
        if (contextAnimeId != null && contextAnimeId <= 0) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "contextAnimeId 必须为正整数");
        }
        String safeTitle = title == null || title.isBlank() ? "新会话" : title.trim();
        String safeSpoiler = spoilerMode == null || spoilerMode.isBlank() ? "SAFE" : spoilerMode;
        if (!safeSpoiler.equals("SAFE") && !safeSpoiler.equals("ALLOW")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "spoilerMode 仅支持 SAFE 或 ALLOW");
        }
        return conversationStore.create(ownerKey, safeTitle, safeSpoiler, contextAnimeId);
    }

    /** 查询当前归属人拥有的会话，存储层负责越权拦截。 */
    public ConversationView get(long conversationId) {
        return conversationStore.get(ownerKey(), conversationId);
    }

    /** 更新当前归属人的会话信息。 */
    public ConversationView update(long conversationId, String title, String spoilerMode, Long contextAnimeId, String status) {
        return conversationStore.update(ownerKey(), conversationId, title, spoilerMode, contextAnimeId, status);
    }

    /** 删除当前归属人的会话及其消息。 */
    public void delete(long conversationId) {
        conversationStore.delete(ownerKey(), conversationId);
    }

    /** 查询会话消息，after 存在时只返回后续增量。 */
    public List<MessageView> messages(long conversationId, Long after) {
        return conversationStore.messages(ownerKey(), conversationId, after);
    }

    /** 返回当前归属键的额度状态，匿名用户使用设备额度。 */
    public QuotaInfoView quota() {
        AuthContext.Context context = AuthContext.get();
        return quotaService.info(ownerKey(context), context.anonymous());
    }

    /**
     * 发送消息并建立 SSE 流。额度不足或参数错误时返回携带 message.failed 事件的 SSE 流，
     * 保证前端能展示后端原因。
     */
    /** 校验消息、执行幂等判断、预占额度并启动异步 SSE 生成。 */
    public SseEmitter sendMessage(long conversationId, String content, String clientMessageId, String spoilerMode) {
        String ownerKey = ownerKey();
        boolean anonymous = AuthContext.get().anonymous();
        SseEmitter emitter = new SseEmitter(180_000L);
        boolean reserved = false;
        try {
            if (content == null || content.isBlank()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "消息内容不能为空");
            }
            if (content.length() > 2000) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "消息内容不能超过 2000 字");
            }
            if (clientMessageId == null || clientMessageId.isBlank() || clientMessageId.length() > 64) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "clientMessageId 缺失或超长");
            }
            if (!conversationStore.belongsToOwner(ownerKey, conversationId)) {
                throw new BusinessException(ErrorCode.NOT_FOUND);
            }

            String safeSpoiler = normalizeSpoilerMode(spoilerMode);
            long existingUserMessageId = conversationStore.userMessageIdByClientKey(conversationId, clientMessageId);
            if (existingUserMessageId > 0) {
                return replay(emitter, conversationId, existingUserMessageId);
            }

            quotaService.reserve(ownerKey, anonymous);
            reserved = true;
            conversationStore.addUserMessage(ownerKey, conversationId, clientMessageId, content.trim(), safeSpoiler);
            long assistantMessageId = conversationStore.createAssistantMessage(ownerKey, conversationId, clientMessageId, 1);

            ConversationView conversation = conversationStore.get(ownerKey, conversationId);
            answerStreamer.stream(conversationId, assistantMessageId, content.trim(), safeSpoiler,
                    conversation.contextAnimeId(), ownerKey, anonymous, emitter);
            return emitter;
        } catch (BusinessException ex) {
            if (reserved) {
                quotaService.refund(ownerKey, anonymous);
            }
            try {
                emitter.send(SseEmitter.event().name(SseEvents.MESSAGE_FAILED).data(Map.of(
                        "messageId", 0,
                        "code", ex.errorCode().code(),
                        "reason", ex.getMessage())));
            } catch (Exception ignored) {
                // 客户端已断开则忽略
            }
            emitter.complete();
            return emitter;
        } catch (RuntimeException ex) {
            if (reserved) {
                quotaService.refund(ownerKey, anonymous);
            }
            throw ex;
        }
    }

    /** 校验消息归属后设置停止标记，不直接中断模型线程。 */
    public void stop(long messageId) {
        conversationStore.getMessageByOwnerAndId(ownerKey(), messageId);
        generationRegistry.requestStop(messageId);
    }

    /** 校验助手消息状态并使用最近用户问题启动一次脱离请求的重生成。 */
    public void regenerate(long messageId) {
        String ownerKey = ownerKey();
        AuthContext.Context context = AuthContext.get();
        MessageView message = conversationStore.getMessageByOwnerAndId(ownerKey, messageId);
        long conversationId = message.conversationId();
        MessageView fresh = conversationStore.getMessage(ownerKey, conversationId, messageId);
        if (!fresh.role().equals("ASSISTANT")) {
            throw new BusinessException(ErrorCode.BAD_STATE, "仅助手消息可以重新生成");
        }
        conversationStore.incrementGenerateTry(messageId);
        ConversationView conversation = conversationStore.get(ownerKey, conversationId);
        String lastUserText = conversationStore.messages(ownerKey, conversationId, null).stream()
                .filter(m -> m.role().equals("USER"))
                .reduce((first, second) -> second)
                .map(MessageView::content)
                .orElse("");
        if (lastUserText.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_STATE, "缺少可重新生成的用户问题");
        }
        SseEmitter detached = new SseEmitter(0L);
        answerStreamer.stream(conversationId, messageId, lastUserText, conversation.spoilerMode(),
                conversation.contextAnimeId(), ownerKey, context.anonymous(), detached);
    }

    /** 重放已存在的助手结果，保证客户端重试不会重复扣额度。 */
    private SseEmitter replay(SseEmitter emitter, long conversationId, long userMessageId) {
        List<MessageView> after = conversationStore.messages(ownerKey(), conversationId, userMessageId);
        MessageView assistant = after.stream().filter(m -> m.role().equals("ASSISTANT")).findFirst().orElse(null);
        try {
            if (assistant != null) {
                QuotaInfoView quota = quotaService.info(ownerKey(), AuthContext.get().anonymous());
                emitter.send(SseEmitter.event().name("message.accepted")
                        .data(java.util.Map.of("messageId", assistant.id(), "conversationId", conversationId)));
                emitter.send(SseEmitter.event().name("message.completed")
                        .data(java.util.Map.of("messageId", assistant.id(), "status", assistant.status(),
                                "quota", java.util.Map.of("used", quota.used(), "limit", quota.limit()))));
            }
        } catch (Exception ignored) {
            // 幂等重放失败不影响主流程
        }
        emitter.complete();
        return emitter;
    }

    /** 从当前认证上下文解析归属键。 */
    private String ownerKey() {
        return ownerKey(AuthContext.get());
    }

    /** 将剧透模式限制为 SAFE 或 ALLOW，空值默认安全模式。 */
    private String normalizeSpoilerMode(String spoilerMode) {
        String safeSpoiler = spoilerMode == null || spoilerMode.isBlank() ? "SAFE" : spoilerMode;
        if (!safeSpoiler.equals("SAFE") && !safeSpoiler.equals("ALLOW")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "spoilerMode 仅支持 SAFE 或 ALLOW");
        }
        return safeSpoiler;
    }

    /** 优先使用登录用户归属，匿名请求必须携带设备编号。 */
    private String ownerKey(AuthContext.Context context) {
        if (context.userId() != null) {
            return "user:" + context.userId();
        }
        if (context.deviceId() == null || context.deviceId().isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 X-Device-Id 请求头");
        }
        return "device:" + context.deviceId();
    }

}
