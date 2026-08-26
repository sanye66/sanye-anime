package com.sanye.anime.sanye_gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * 公开静态资源跨源许可（T-G-06 修复）：客户端 <img> 加载跨源 SVG 封面/公开文件时
 * 属于 no-cors 请求（不带 Origin），globalcors 只在带 Origin 时附加 CORS 头，
 * 导致 Chrome ORB 拦截 SVG。这里对公开静态路径的无 Origin 请求附加
 * Access-Control-Allow-Origin: *，使封面可跨源渲染。
 */
@Component
public class GatewayStaticCorsFilter implements GlobalFilter, Ordered {

    /** 为公开静态资源的无 Origin 请求补充跨源响应头。 */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (isPublicStatic(path) && exchange.getRequest().getHeaders().getOrigin() == null
                && !exchange.getResponse().getHeaders().containsKey(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)) {
            exchange.getResponse().getHeaders().set(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        }
        return chain.filter(exchange);
    }

    /** 判断路径是否为封面或公开文件资源。 */
    private boolean isPublicStatic(String path) {
        return path.startsWith("/covers/") || path.startsWith("/admin-profile/")
                || path.startsWith("/api/v1/files/");
    }

    /** 保持静态资源 CORS 处理与请求编号过滤器同级。 */
    @Override
    public int getOrder() {
        return -90;
    }
}
