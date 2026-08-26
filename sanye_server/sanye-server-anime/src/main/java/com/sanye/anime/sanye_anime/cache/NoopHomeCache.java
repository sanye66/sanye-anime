package com.sanye.anime.sanye_anime.cache;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * 关闭缓存时的空实现（HOME_CACHE_ENABLED=false）。
 */
@Component
@ConditionalOnProperty(name = "sanye.home.cache-enabled", havingValue = "false")
public class NoopHomeCache implements HomeCache {

    /** 关闭缓存时始终返回空，强制上层直接回源。 */
    @Override
    public Optional<String> get(String key) {
        return Optional.empty();
    }

    /** 空缓存实现不保存数据，保留接口以便配置切换。 */
    @Override
    public void put(String key, String json, Duration ttl) {
        // no-op
    }

    /** 空缓存实现无需执行删除操作。 */
    @Override
    public void delete(String key) {
        // no-op
    }
}
