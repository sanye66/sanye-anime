package com.sanye.anime.sanye_core.controller;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 系统基础接口，对应 docs/api-contract.md 第 3 节。
 */
@RestController
@RequestMapping("/api/v1/system")
public class SystemController {

    private final HttpServletRequest request;

    /** 保存请求对象，系统探活和能力接口需要回传请求编号。 */
    public SystemController(HttpServletRequest request) {
        this.request = request;
    }

    /** 返回基础存活标志，用于网关和部署探活。 */
    @GetMapping("/ping")
    public ApiResponse<Map<String, Boolean>> ping() {
        return ApiResponse.ok(Map.of("pong", true), requestId());
    }

    /** 返回当前服务支持的业务能力标识。 */
    @GetMapping("/capabilities")
    public ApiResponse<List<String>> capabilities() {
        return ApiResponse.ok(List.of("anime", "search", "ai_chat", "favorite", "feedback", "admin"), requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
