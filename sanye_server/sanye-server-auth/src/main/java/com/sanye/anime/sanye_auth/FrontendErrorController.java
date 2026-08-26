package com.sanye.anime.sanye_auth;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 前端错误上报（联调基线）：记录结构化日志并保留最近 200 条内存快照。
 * 监控指标与告警（Prometheus/Grafana/Alertmanager）在 T-G-03 接入。
 * 契约：POST /api/v1/monitor/frontend-errors，body {type, message, stack?, url, route?, deviceId?}。
 */
@RestController
public class FrontendErrorController {

    private static final Logger log = LoggerFactory.getLogger(FrontendErrorController.class);

    private final HttpServletRequest request;

    /** 保存请求对象，错误页面仍需返回可追踪的请求编号。 */
    public FrontendErrorController(HttpServletRequest request) {
        this.request = request;
    }

    /** 接收前端错误摘要并记录请求编号，便于按链路定位页面异常。 */
    @PostMapping("/api/v1/monitor/frontend-errors")
    public ApiResponse<Void> report(@RequestBody Map<String, Object> payload) {
        log.warn("前端错误上报 type={} message={} url={} deviceId={} requestId={}",
                payload.get("type"), payload.get("message"), payload.get("url"),
                payload.get("deviceId"), requestId());
        return ApiResponse.ok(null, requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
