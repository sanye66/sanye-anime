package com.sanye.anime.sanye_ai_chat.store;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存偏好存储（联调基线，线程安全）。服务重启数据丢失，仅用于开发联调；
 * 正式持久化由 PostgreSQL 实现替换。
 */
@Repository
@ConditionalOnProperty(name = "sanye.ai.preference-store", havingValue = "memory")
public class InMemoryPreferenceStore implements PreferenceStore {

    private final Map<String, Preference> preferences = new ConcurrentHashMap<>();

    /** 从线程安全内存映射读取偏好。 */
    @Override
    public Optional<Preference> get(String ownerKey) {
        return Optional.ofNullable(preferences.get(ownerKey));
    }

    /** 替换内存中的归属键偏好，仅用于联调和降级。 */
    @Override
    public Preference save(String ownerKey, Double temperature, Integer contextLength, String modelName, Instant now) {
        Preference preference = new Preference(ownerKey, temperature, contextLength, modelName, now);
        preferences.put(ownerKey, preference);
        return preference;
    }
}
