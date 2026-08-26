package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.LegalDocumentView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.security.InternalCallerToken;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 法律正文受控管理接口（T-D-07）：仅供管理后端（RuoYi）经服务间调用访问，
 * 要求 X-Caller-Name 与配置的调用方一致；网关不暴露 /api/v1/manage/**。
 */
@RestController
@RequestMapping("/api/v1/manage/legal")
public class LegalManageController {

    private final LegalDocumentService legalDocumentService;
    private final HttpServletRequest request;
    private final String allowedCaller;
    private final String internalToken;

    /** 注入正文服务和请求对象，管理接口响应统一携带请求编号。 */
    public LegalManageController(LegalDocumentService legalDocumentService, HttpServletRequest request,
                                 @Value("${sanye.manage.allowed-caller:sanye-admin-server}") String allowedCaller,
                                 @Value("${sanye.manage.internal-token:}") String internalToken) {
        this.legalDocumentService = legalDocumentService;
        this.request = request;
        this.allowedCaller = allowedCaller;
        this.internalToken = internalToken;
    }

    /** 查询全部法律正文，包含管理端草稿。 */
    @GetMapping
    public ApiResponse<List<LegalDocumentView>> list() {
        checkCaller();
        return ApiResponse.ok(legalDocumentService.listAll(), requestId());
    }

    /** 保存法律正文或发布版本，调用方身份由请求头校验。 */
    @PutMapping("/{key}")
    public ApiResponse<LegalDocumentView> update(@PathVariable String key, @RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(legalDocumentService.update(key, body.get("title"), body.get("content"),
                body.get("status"), request.getHeader("X-Caller-Name")), requestId());
    }

    /** 校验 RuoYi 管理后端的服务间调用凭证。 */
    private void checkCaller() {
        String caller = request.getHeader("X-Caller-Name");
        if (caller == null || !caller.equals(allowedCaller)
                || !InternalCallerToken.matches(internalToken, request.getHeader("X-Internal-Token"))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "调用方校验失败");
        }
    }

    /** 读取链路请求编号，保持管理接口响应格式一致。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
