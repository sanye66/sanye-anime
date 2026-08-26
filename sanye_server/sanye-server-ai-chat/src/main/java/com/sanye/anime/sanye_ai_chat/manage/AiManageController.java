package com.sanye.anime.sanye_ai_chat.manage;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.security.InternalCallerToken;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 统计受控接口（管理端仪表盘）：仅供管理后端经服务间调用访问。
 */
@RestController
@RequestMapping("/api/v1/manage/ai/stats")
public class AiManageController {

    private final AiStatsService aiStatsService;
    private final HttpServletRequest request;
    private final String allowedCaller;
    private final String internalToken;

    /** 注入统计服务、请求对象和服务间鉴权配置。 */
    public AiManageController(AiStatsService aiStatsService, HttpServletRequest request,
                              @Value("${sanye.manage.allowed-caller:sanye-admin-server}") String allowedCaller,
                              @Value("${sanye.manage.internal-token:}") String internalToken) {
        this.aiStatsService = aiStatsService;
        this.request = request;
        this.allowedCaller = allowedCaller;
        this.internalToken = internalToken;
    }

    /** 校验管理服务调用方后返回 AI 统计数据。 */
    @GetMapping
    public ApiResponse<AiStatsView> stats() {
        String caller = request.getHeader("X-Caller-Name");
        if (caller == null || !caller.equals(allowedCaller)
                || !InternalCallerToken.matches(internalToken, request.getHeader("X-Internal-Token"))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "调用方校验失败");
        }
        return ApiResponse.ok(aiStatsService.stats(), requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
