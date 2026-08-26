package com.sanye.anime.sanye_anime;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * 首页指标（T-G-03 第一批，与监控方案 3.2 节对齐）：
 * 请求数与缓存命中/未命中，经 /actuator/prometheus 暴露。
 */
@Component
public class HomeMetrics {

    private final Counter requests;
    private final Counter cacheHits;
    private final Counter cacheMisses;
    private final Counter errors;

    /** 在监控注册表中创建首页请求、缓存和异常指标。 */
    public HomeMetrics(MeterRegistry registry) {
        this.requests = Counter.builder("sanye_home_request_total")
                .description("首页请求数").register(registry);
        this.cacheHits = Counter.builder("sanye_home_cache_hit_total")
                .description("首页缓存命中数").register(registry);
        this.cacheMisses = Counter.builder("sanye_home_cache_miss_total")
                .description("首页缓存未命中数").register(registry);
        this.errors = Counter.builder("sanye_home_error_total")
                .description("首页聚合错误数").register(registry);
    }

    /** 记录首页请求总量。 */
    public void request() {
        requests.increment();
    }

    /** 记录首页缓存命中。 */
    public void cacheHit() {
        cacheHits.increment();
    }

    /** 记录首页缓存未命中。 */
    public void cacheMiss() {
        cacheMisses.increment();
    }

    /** 记录首页聚合异常。 */
    public void error() {
        errors.increment();
    }
}
