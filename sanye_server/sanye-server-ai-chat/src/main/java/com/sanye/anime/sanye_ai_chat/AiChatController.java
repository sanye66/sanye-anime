package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_ai_chat.model.SseEvents;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * AI 对话接口，路由与 docs/api-contract.md 第 7 节、前端 ai.ts 对齐。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiChatController {

    private final ConversationService conversationService;
    private final HttpServletRequest request;

    /** 注入会话服务和当前请求对象，统一处理归属校验与请求编号。 */
    public AiChatController(ConversationService conversationService, HttpServletRequest request) {
        this.conversationService = conversationService;
        this.request = request;
    }

    /** 查询当前用户或设备拥有的会话分页。 */
    @GetMapping("/conversations")
    public ApiResponse<PageResult<ConversationView>> conversations(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(conversationService.list(page, Math.min(size, 50)), requestId());
    }

    /** 创建新的 AI 会话。 */
    @PostMapping("/conversations")
    public ApiResponse<ConversationView> createConversation(@RequestBody CreateConversationBody body) {
        return ApiResponse.ok(conversationService.create(body.title(), body.spoilerMode(), body.contextAnimeId()),
                requestId());
    }

    /** 查询当前归属人拥有的单个会话。 */
    @GetMapping("/conversations/{id}")
    public ApiResponse<ConversationView> conversation(@PathVariable long id) {
        return ApiResponse.ok(conversationService.get(id), requestId());
    }

    /** 更新会话标题、剧透模式、上下文作品或状态。 */
    @PatchMapping("/conversations/{id}")
    public ApiResponse<ConversationView> updateConversation(@PathVariable long id,
                                                            @RequestBody UpdateConversationBody body) {
        return ApiResponse.ok(conversationService.update(id, body.title(), body.spoilerMode(),
                body.contextAnimeId(), body.status()), requestId());
    }

    /** 删除当前归属人的会话及关联消息。 */
    @DeleteMapping("/conversations/{id}")
    public ApiResponse<Void> deleteConversation(@PathVariable long id) {
        conversationService.delete(id);
        return ApiResponse.ok(null, requestId());
    }

    /** 查询会话消息，可通过 after 增量拉取。 */
    @GetMapping("/conversations/{id}/messages")
    public ApiResponse<List<MessageView>> messages(@PathVariable long id,
                                                   @RequestParam(required = false) Long after) {
        return ApiResponse.ok(conversationService.messages(id, after), requestId());
    }

    /** 提交用户消息并以 SSE 流返回助手生成过程。 */
    @PostMapping(value = "/conversations/{id}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter sendMessage(@PathVariable long id, @RequestBody SendMessageBody body) {
        return conversationService.sendMessage(id, body.content(), body.clientMessageId(), body.spoilerMode());
    }

    /** 请求停止指定助手消息的继续生成。 */
    @PostMapping("/messages/{messageId}/stop")
    public ApiResponse<Void> stop(@PathVariable long messageId) {
        conversationService.stop(messageId);
        return ApiResponse.ok(null, requestId());
    }

    /** 基于最近一条用户问题重新生成助手回答。 */
    @PostMapping("/messages/{messageId}/regenerate")
    public ApiResponse<Void> regenerate(@PathVariable long messageId) {
        conversationService.regenerate(messageId);
        return ApiResponse.ok(null, requestId());
    }

    /** 查询当前归属人的 AI 额度使用情况。 */
    @GetMapping("/quota")
    public ApiResponse<QuotaInfoView> quota() {
        return ApiResponse.ok(conversationService.quota(), requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }

    public record CreateConversationBody(String title, String spoilerMode, Long contextAnimeId) {
    }

    public record UpdateConversationBody(String title, String spoilerMode, Long contextAnimeId, String status) {
    }

    public record SendMessageBody(String content, String clientMessageId, String spoilerMode) {
    }
}
