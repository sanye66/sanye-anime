package com.sanye.anime.sanye_feedback;

import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 反馈提交接口（客户端）。
 */
@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {

    private final FeedbackService feedbackService;
    private final HttpServletRequest request;

    /** 注入反馈服务和请求对象，统一处理设备归属及请求编号。 */
    public FeedbackController(FeedbackService feedbackService, HttpServletRequest request) {
        this.feedbackService = feedbackService;
        this.request = request;
    }

    /** 校验设备身份并提交客户端反馈。 */
    @PostMapping
    public ApiResponse<Map<String, Long>> submit(@RequestBody SubmitBody body) {
        String deviceKey = AuthContext.get().deviceId();
        if (deviceKey == null || deviceKey.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 X-Device-Id 请求头");
        }
        long id = feedbackService.submit(deviceKey, body.type(), body.content(), body.contact());
        return ApiResponse.ok(Map.of("id", id), requestId());
    }

    /** 读取链路请求编号并写入反馈响应。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }

    public record SubmitBody(String type, String content, String contact) {
    }
}
