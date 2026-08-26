package com.sanye.anime.sanye_ai_chat.model;

import java.util.List;

/**
 * AI 模型运行状态（只读，不下发任何密钥或内部地址）：
 * 供客户端“模型配置”页展示服务端能力与当前模型基线。
 */
public record ModelInfoView(String provider, String providerLabel, String model, double temperature,
                            String memoryStore, String memoryLabel, boolean ragEnabled, boolean safetyEnabled,
                            String preferenceStore, List<Integer> allowedContextLengths) {
}
