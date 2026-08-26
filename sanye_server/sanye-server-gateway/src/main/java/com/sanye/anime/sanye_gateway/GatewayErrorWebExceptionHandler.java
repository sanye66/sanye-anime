package com.sanye.anime.sanye_gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.cloud.gateway.support.NotFoundException;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * 网关异常兜底（T-G-06）：上游连接拒绝/超时等异常路径返回统一业务错误包
 * （code=5002，保留 requestId），避免默认错误页不可识别；已提交响应不再改写。
 */
@Component
@Order(-2)
public class GatewayErrorWebExceptionHandler implements ErrorWebExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GatewayErrorWebExceptionHandler.class);

    /** 捕获网关转发异常并返回可识别的 404/服务不可用业务包。 */
    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        ServerHttpResponse response = exchange.getResponse();
        if (response.isCommitted()) {
            return Mono.error(ex);
        }
        log.warn("网关转发失败 path={} error={}", exchange.getRequest().getPath(), ex.toString());
        boolean notFound = ex instanceof NotFoundException
                || (ex instanceof ResponseStatusException statusException
                && statusException.getStatusCode().value() == HttpStatus.NOT_FOUND.value());
        response.setStatusCode(notFound ? HttpStatus.NOT_FOUND : HttpStatus.SERVICE_UNAVAILABLE);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String requestId = exchange.getRequest().getHeaders().getFirst(GatewayFilters.REQUEST_ID_HEADER);
        String code = notFound ? "2003" : "5002";
        String message = notFound ? "资源不存在" : "服务暂不可用，请稍后重试";
        String body = "{\"code\":" + code + ",\"message\":\"" + message + "\",\"data\":null,\"requestId\":\""
                + (requestId == null ? "" : requestId) + "\"}";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }
}
