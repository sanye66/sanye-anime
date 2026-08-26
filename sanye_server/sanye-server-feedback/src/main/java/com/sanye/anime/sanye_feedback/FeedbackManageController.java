package com.sanye.anime.sanye_feedback;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.security.InternalCallerToken;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import com.sanye.anime.sanye_feedback.model.AdminFeedbackView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 反馈管理受控接口（T-F-03 第二批）：仅供管理后端经服务间调用访问。
 */
@RestController
@RequestMapping("/api/v1/manage/feedback")
public class FeedbackManageController {

    private final FeedbackService feedbackService;
    private final HttpServletRequest request;
    private final String allowedCaller;
    private final String internalToken;

    /** 注入反馈服务和请求对象，管理写操作由服务间凭证保护。 */
    public FeedbackManageController(FeedbackService feedbackService, HttpServletRequest request,
                                    @Value("${sanye.manage.allowed-caller:sanye-admin-server}") String allowedCaller,
                                    @Value("${sanye.manage.internal-token:}") String internalToken) {
        this.feedbackService = feedbackService;
        this.request = request;
        this.allowedCaller = allowedCaller;
        this.internalToken = internalToken;
    }

    /** 查询反馈管理列表，写操作前先完成服务间鉴权。 */
    @GetMapping
    public ApiResponse<List<AdminFeedbackView>> list() {
        checkCaller();
        return ApiResponse.ok(feedbackService.listAll(), requestId());
    }

    /** 更新反馈处理状态并记录管理操作人。 */
    @PatchMapping("/{id}")
    public ApiResponse<AdminFeedbackView> updateStatus(@PathVariable long id, @RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(feedbackService.updateStatus(id, body.get("status"), "sanye-admin-server"), requestId());
    }

    /** 校验管理后端调用方名称和内部令牌。 */
    private void checkCaller() {
        String caller = request.getHeader("X-Caller-Name");
        if (caller == null || !caller.equals(allowedCaller)
                || !InternalCallerToken.matches(internalToken, request.getHeader("X-Internal-Token"))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "调用方校验失败");
        }
    }

    /** 读取链路请求编号，统一管理接口的响应格式。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
