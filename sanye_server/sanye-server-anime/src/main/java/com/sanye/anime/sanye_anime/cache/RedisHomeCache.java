package com.sanye.anime.sanye_anime.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * Redis 首页缓存：缓存读写失败时静默降级（直接回源），不阻塞接口。
 */
@Component
@ConditionalOnProperty(name = "sanye.home.cache-enabled", havingValue = "true", matchIfMissing = true)
public class RedisHomeCache implements HomeCache {

    private static final Logger log = LoggerFactory.getLogger(RedisHomeCache.class);
    private static final String KEY_PREFIX = "sanye:home:";

    private final StringRedisTemplate redis;

    /** 注入 Redis 模板，缓存不可用时由实现内部记录告警并交给上层回源。 */
    public RedisHomeCache(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 从 Redis 读取首页 JSON，连接异常时降级为空缓存。 */
    @Override
    public Optional<String> get(String key) {
        try {
            return Optional.ofNullable(redis.opsForValue().get(KEY_PREFIX + key));
        } catch (RuntimeException ex) {
            log.warn("首页缓存读取不可用，跳过缓存 key={} error={}", key, ex.getMessage());
            return Optional.empty();
        }
    }

    /** 按 TTL 写入首页 JSON，Redis 不可用时由上层继续提供回源结果。 */
    @Override
    public void put(String key, String json, Duration ttl) {
        try {
            redis.opsForValue().set(KEY_PREFIX + key, json, ttl);
        } catch (RuntimeException ex) {
            log.warn("首页缓存写入不可用 key={} error={}", key, ex.getMessage());
        }
    }

    /** 删除指定首页缓存，失败时仅记录告警而不阻断业务写入。 */
    @Override
    public void delete(String key) {
        try {
            redis.delete(KEY_PREFIX + key);
        } catch (RuntimeException ex) {
            log.warn("首页缓存删除不可用 key={} error={}", key, ex.getMessage());
        }
    }
}
