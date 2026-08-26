package com.sanye.anime.sanye_auth;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * CAS 单点登录接口（T-F-01）：登录跳转与回调（ticket → 本地会话）。
 */
@RestController
@RequestMapping("/api/v1/auth/cas")
public class CasController {

    private final CasService casService;
    private final HttpServletRequest request;

    /** 注入 CAS 业务服务和请求对象，统一写入请求编号。 */
    public CasController(CasService casService, HttpServletRequest request) {
        this.casService = casService;
        this.request = request;
    }

    /** 生成 CAS 登录跳转地址。 */
    @GetMapping("/login")
    public ApiResponse<Map<String, String>> login(@RequestParam(required = false) String service) {
        return ApiResponse.ok(casService.loginUrl(service), requestId());
    }

    /** 校验 CAS ticket 并换取本地 access/refresh 会话。 */
    @GetMapping("/callback")
    public ApiResponse<Map<String, Object>> callback(@RequestParam String ticket,
                                                     @RequestParam(required = false) String service) {
        return ApiResponse.ok(casService.handleCallback(ticket, service), requestId());
    }

    /** 轮换 refreshToken 并签发新的访问令牌。 */
    @PostMapping("/refresh")
    public ApiResponse<Map<String, Object>> refresh(@RequestBody Map<String, String> body) {
        return ApiResponse.ok(casService.refresh(body.get("refreshToken")), requestId());
    }

    /** 吊销 refreshToken，并返回 CAS 登出地址。 */
    @PostMapping("/logout")
    public ApiResponse<Map<String, String>> logout(@RequestBody Map<String, String> body) {
        return ApiResponse.ok(casService.logout(body.get("refreshToken")), requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
