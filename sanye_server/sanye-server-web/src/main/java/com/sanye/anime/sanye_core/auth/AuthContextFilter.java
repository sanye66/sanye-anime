package com.sanye.anime.sanye_core.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 用户上下文过滤器（T-F-01）：userId 由网关 Bearer JWT 校验后注入的 X-User-Id 读取
 * （可信来源，业务服务不自行解析 token）；deviceId 从 X-Device-Id 读取（匿名兜底）。
 */
@Component
@Order(2)
public class AuthContextFilter extends OncePerRequestFilter {

    /** 从网关请求头建立用户/设备上下文，并在请求结束后清理线程变量。 */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String deviceId = request.getHeader("X-Device-Id");
        Long userId = parseUserId(request.getHeader("X-User-Id"));
        AuthContext.set(new AuthContext.Context(
                userId,
                deviceId == null || deviceId.isBlank() ? null : deviceId,
                userId == null));
        try {
            chain.doFilter(request, response);
        } finally {
            AuthContext.clear();
        }
    }

    /** 宽松解析网关注入的用户编号，非法值按匿名请求处理。 */
    private Long parseUserId(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(header);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
