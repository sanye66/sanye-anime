package com.sanye.anime.sanye_ai_chat.model;

import java.time.Instant;

/**
 * AI 回答偏好视图（T-D-05 模型配置页）：设备/用户维度，上下文长度与温度可选覆盖。
 */
public record AiPreferenceView(Double temperature, Integer contextLength, String modelName, Instant updatedAt) {

    /** 将存储层偏好字段组装为接口视图，保持空覆盖值可选。 */
    public static AiPreferenceView of(Double temperature, Integer contextLength, String modelName, Instant updatedAt) {
        return new AiPreferenceView(temperature, contextLength, modelName, updatedAt);
    }
}
