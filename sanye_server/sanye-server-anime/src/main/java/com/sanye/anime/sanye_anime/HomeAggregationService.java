package com.sanye.anime.sanye_anime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.cache.HomeCache;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.HomeResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

/**
 * 首页聚合与缓存（T-D-01）：
 * - 缓存击穿防护：按 tab 单飞（同一时间只有一个线程回源）；
 * - 穿透防护：空结果也短 TTL 缓存；
 * - 雪崩防护：TTL 在基线上叠加随机抖动；
 * - 失效：内容变更时调用 invalidate(tab)（管理端写入接入后经 Outbox 事件触发）。
 */
@Service
public class HomeAggregationService {

    private static final Logger log = LoggerFactory.getLogger(HomeAggregationService.class);

    private final HomeCache cache;
    private final ObjectMapper objectMapper;
    private final Map<String, CompletableFuture<HomeResponse>> inFlight = new ConcurrentHashMap<>();
    private final HomeMetrics homeMetrics;
    private final Duration ttl;
    private final Duration emptyTtl;

    /** 注入缓存、序列化器和监控组件，首页聚合支持缓存及并发单飞。 */
    public HomeAggregationService(HomeCache cache, ObjectMapper objectMapper, HomeMetrics homeMetrics,
                                  @Value("${sanye.home.cache-ttl-seconds:300}") long ttlSeconds,
                                  @Value("${sanye.home.empty-cache-ttl-seconds:30}") long emptyTtlSeconds) {
        this.cache = cache;
        this.objectMapper = objectMapper;
        this.homeMetrics = homeMetrics;
        this.ttl = Duration.ofSeconds(ttlSeconds);
        this.emptyTtl = Duration.ofSeconds(emptyTtlSeconds);
    }

    /** 读取首页缓存；缓存失效时按 tab 单飞回源，并处理线程中断和异步异常。 */
    public HomeResponse home(String tab, Supplier<HomeResponse> loader) {
        String key = "home:" + tab;
        homeMetrics.request();
        Optional<String> cached = cache.get(key);
        if (cached.isPresent()) {
            Optional<HomeResponse> parsed = parse(key, cached.get());
            if (parsed.isPresent()) {
                homeMetrics.cacheHit();
                return parsed.get();
            }
            cache.delete(key);
        }
        homeMetrics.cacheMiss();
        CompletableFuture<HomeResponse> future = inFlight.computeIfAbsent(key,
                k -> CompletableFuture.supplyAsync(() -> loadAndCache(k, loader)));
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return loader.get();
        } catch (java.util.concurrent.ExecutionException ex) {
            homeMetrics.error();
            throw new IllegalStateException("首页聚合失败", ex.getCause());
        } finally {
            inFlight.remove(key, future);
        }
    }

    /** 删除指定标签首页缓存，使管理端内容修改尽快对外生效。 */
    public void invalidate(String tab) {
        cache.delete("home:" + tab);
        log.info("首页缓存失效 tab={}", tab);
    }

    /** 执行一次回源并按空结果、随机抖动策略写入缓存。 */
    private HomeResponse loadAndCache(String key, Supplier<HomeResponse> loader) {
        HomeResponse data = loader.get();
        boolean empty = data.sections() == null || data.sections().isEmpty();
        Duration cacheTtl = empty ? emptyTtl : ttl.plus(Duration.ofSeconds(ThreadLocalRandom.current().nextLong(0, 61)));
        try {
            cache.put(key, objectMapper.writeValueAsString(data), cacheTtl);
        } catch (JsonProcessingException ex) {
            log.warn("首页聚合序列化失败 key={} error={}", key, ex.getMessage());
        }
        return data;
    }

    /** 反序列化缓存内容；损坏缓存只触发回源，不影响首页请求。 */
    private Optional<HomeResponse> parse(String key, String json) {
        try {
            return Optional.of(objectMapper.readValue(json, HomeResponse.class));
        } catch (JsonProcessingException ex) {
            log.warn("首页缓存反序列化失败 key={} error={}", key, ex.getMessage());
            return Optional.empty();
        }
    }
}
