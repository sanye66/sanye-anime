package com.sanye.anime.sanye_gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * 网关全局过滤器：注入 X-Request-Id；鉴权前置与公开白名单在 T-C-05 接入。
 */
@Component
public class GatewayFilters implements GlobalFilter, Ordered {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    /** 复用或生成请求编号，并将其透传到下游服务。 */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String requestId = request.getHeaders().getFirst(REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        ServerHttpRequest mutated = request.mutate().header(REQUEST_ID_HEADER, requestId).build();
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    /** 保证请求编号过滤器位于鉴权过滤器之前。 */
    @Override
    public int getOrder() {
        return -100;
    }
}
