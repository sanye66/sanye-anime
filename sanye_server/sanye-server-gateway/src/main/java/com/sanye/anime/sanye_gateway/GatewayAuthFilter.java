package com.sanye.anime.sanye_gateway;

import com.sanye.anime.sanye_core.auth.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 网关鉴权前置（T-C-05，设计 4.4/8.8 节）：
 * 公开白名单直接放行；业务路由要求 X-Device-Id 标识请求来源，
 * 缺失时返回 2001 统一错误包。正式 CAS Token 校验在 T-F-01 接入后增强。
 */
@Component
public class GatewayAuthFilter implements GlobalFilter, Ordered {

    public static final String DEVICE_ID_HEADER = "X-Device-Id";
    public static final String USER_ID_HEADER = "X-User-Id";
    private static final List<String> PUBLIC_PREFIXES = List.of(
            "/api/v1/public/", "/covers/", "/admin-profile/", "/actuator/", "/api/v1/monitor/");
    private static final String PUBLIC_PING = "/api/v1/system/ping";

    private final JwtService jwtService;

    /** 注入 JWT 密钥和公开路径配置，构造网关鉴权过滤器。 */
    public GatewayAuthFilter(@Value("${sanye.auth.token-secret}") String secret,
                             @Value("${sanye.auth.access-ttl-seconds:1800}") long accessTtlSeconds) {
        this.jwtService = new JwtService(secret, accessTtlSeconds);
    }

    /** 处理预检、公开白名单、JWT 校验和匿名设备身份注入。 */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest().mutate()
                // X-User-Id is a gateway-owned identity header. Never trust a value supplied by a client.
                .headers(headers -> headers.remove(USER_ID_HEADER))
                .build();
        ServerWebExchange sanitizedExchange = exchange.mutate().request(request).build();
        // CORS 预检直接放行
        if (request.getMethod() == HttpMethod.OPTIONS) {
            return chain.filter(sanitizedExchange);
        }
        String path = request.getPath().value();
        if (isPublic(path)) {
            return chain.filter(sanitizedExchange);
        }
        // 管理端令牌由 RuoYi 自身校验（/api/v1/admin/**）、系统能力接口低敏（/api/v1/system/**），网关不干预其 Authorization
        if (path.startsWith("/api/v1/admin/") || path.startsWith("/api/v1/system/")) {
            String deviceId = request.getHeaders().getFirst(DEVICE_ID_HEADER);
            if (deviceId == null || deviceId.isBlank()) {
                return unauthorized(exchange, request, "缺少 X-Device-Id，无法识别请求来源");
            }
            return chain.filter(sanitizedExchange);
        }
        // 登录态：我方 JWT 校验通过后注入 X-User-Id；无效 token 返回 401（前端自动 refresh 后重放）
        String authorization = request.getHeaders().getFirst("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) {
            var claims = jwtService.verify(authorization.substring(7));
            if (claims.isPresent()) {
                ServerHttpRequest mutated = request.mutate()
                        .header(USER_ID_HEADER, String.valueOf(claims.get().userId()))
                        .build();
                return chain.filter(exchange.mutate().request(mutated).build());
            }
            return unauthorized(exchange, request, "登录凭证无效或已过期");
        }
        String deviceId = request.getHeaders().getFirst(DEVICE_ID_HEADER);
        if (deviceId == null || deviceId.isBlank()) {
            return unauthorized(exchange, request, "缺少 X-Device-Id，无法识别请求来源");
        }
        return chain.filter(sanitizedExchange);
    }

    /** 判断路径是否属于公开资源白名单。 */
    static boolean isPublic(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        if (path.equals(PUBLIC_PING)) {
            return true;
        }
        return PUBLIC_PREFIXES.stream().anyMatch(path::startsWith);
    }

    /** 返回统一未授权 JSON，并保留网关生成的请求编号。 */
    private Mono<Void> unauthorized(ServerWebExchange exchange, ServerHttpRequest request, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String requestId = request.getHeaders().getFirst(GatewayFilters.REQUEST_ID_HEADER);
        String body = "{\"code\":2001,\"message\":\"" + message + "\",\"data\":null,\"requestId\":\""
                + (requestId == null ? "" : requestId) + "\"}";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }

    /** 让请求编号过滤器先执行，再进行鉴权。 */
    @Override
    public int getOrder() {
        // 在请求 ID 过滤器（-100）之后执行，保证响应包携带 requestId
        return -90;
    }
}
