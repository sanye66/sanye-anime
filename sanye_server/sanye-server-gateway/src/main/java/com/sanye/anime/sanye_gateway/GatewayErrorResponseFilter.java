package com.sanye.anime.sanye_gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * 网关上游故障统一错误包（T-G-06）：上游服务返回 5xx 且响应未提交时，
 * 改写为统一业务错误 JSON（code=5002 SERVICE_UNAVAILABLE，保留 requestId），
 * 供前端按错误码降级展示；SSE 等已提交流不干预。
 */
@Component
public class GatewayErrorResponseFilter implements GlobalFilter, Ordered {

    /** 将未提交的上游 5xx 响应转换为统一服务不可用错误。 */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange).then(Mono.defer(() -> {
            ServerHttpResponse response = exchange.getResponse();
            HttpStatusCode status = response.getStatusCode();
            if (status == null || !status.is5xxServerError() || response.isCommitted()) {
                return Mono.empty();
            }
            response.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            String requestId = exchange.getRequest().getHeaders().getFirst(GatewayFilters.REQUEST_ID_HEADER);
            String body = "{\"code\":5002,\"message\":\"服务暂不可用，请稍后重试\",\"data\":null,\"requestId\":\""
                    + (requestId == null ? "" : requestId) + "\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            DataBuffer buffer = response.bufferFactory().wrap(bytes);
            return response.writeWith(Mono.just(buffer));
        }));
    }

    /** 在响应链末端执行错误响应改写。 */
    @Override
    public int getOrder() {
        return 100;
    }
}
