package com.sanye.anime.sanye_ai_chat.store;

import java.time.Instant;
import java.util.Optional;

/**
 * AI 回答偏好存储抽象：按 owner_key（device:xxx / user:xxx）维度读写。
 * 联调阶段使用内存实现；正式持久化使用 PostgreSQL 实现（T-D-05）。
 */
public interface PreferenceStore {

    /** 按用户或设备归属键读取 AI 偏好。 */
    Optional<Preference> get(String ownerKey);

    /** 保存归属键对应的温度、上下文长度和模型名偏好。 */
    Preference save(String ownerKey, Double temperature, Integer contextLength, String modelName, Instant now);

    record Preference(String ownerKey, Double temperature, Integer contextLength, String modelName, Instant updatedAt) {
    }
}
