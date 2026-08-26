package com.sanye.anime.sanye_anime.cache;

import java.time.Duration;
import java.util.Optional;

/**
 * 首页聚合缓存抽象（T-D-01）：Redis 实现 + 关闭时 Noop 实现。
 */
public interface HomeCache {

    Optional<String> get(String key);

    void put(String key, String json, Duration ttl);

    void delete(String key);
}
