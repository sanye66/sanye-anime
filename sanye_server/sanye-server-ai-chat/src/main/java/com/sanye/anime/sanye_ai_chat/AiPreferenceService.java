package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.ai.ChatMemoryManager;
import com.sanye.anime.sanye_ai_chat.model.AiPreferenceView;
import com.sanye.anime.sanye_ai_chat.model.ModelInfoView;
import com.sanye.anime.sanye_ai_chat.store.PreferenceStore;
import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * AI 回答偏好服务（T-D-05 模型配置页）：设备/用户维度偏好读写 + 服务端模型状态（只读）。
 * 偏好持久化默认 PostgreSQL（sanye_ai_preference），上下文长度真实作用于会话记忆窗口；
 * 温度与模型名作为偏好保存，模型请求参数化在 OpenAI 提供方接入时生效。
 */
@Service
public class AiPreferenceService {

    /** 前端可选择的上下文长度白名单，避免任意值改变模型资源消耗。 */
    public static final List<Integer> ALLOWED_CONTEXT_LENGTHS = List.of(4096, 8192, 16384);

    private final PreferenceStore preferenceStore;
    private final ChatMemoryManager chatMemoryManager;
    private final String provider;
    private final String model;
    private final double temperature;
    private final String memoryStore;
    private final String preferenceStoreType;

    /** 注入偏好持久化和记忆窗口管理器，保存偏好后立即使旧窗口失效。 */
    public AiPreferenceService(PreferenceStore preferenceStore, ChatMemoryManager chatMemoryManager,
                               @Value("${sanye.ai.provider:dev}") String provider,
                               @Value("${sanye.ai.model:gpt-4o-mini}") String model,
                               @Value("${sanye.ai.temperature:0.7}") double temperature,
                               @Value("${sanye.ai.memory-store:pg}") String memoryStore,
                               @Value("${sanye.ai.preference-store:pg}") String preferenceStoreType) {
        this.preferenceStore = preferenceStore;
        this.chatMemoryManager = chatMemoryManager;
        this.provider = provider;
        this.model = model;
        this.temperature = temperature;
        this.memoryStore = memoryStore;
        this.preferenceStoreType = preferenceStoreType;
    }

    /** 读取当前归属人的偏好，未配置时返回空偏好让前端使用默认值。 */
    public AiPreferenceView get() {
        PreferenceStore.Preference preference = preferenceStore.get(ownerKey()).orElse(null);
        if (preference == null) {
            return AiPreferenceView.of(null, null, null, null);
        }
        return AiPreferenceView.of(preference.temperature(), preference.contextLength(),
                preference.modelName(), preference.updatedAt());
    }

    /** 校验偏好范围、保存数据并使该归属人的记忆窗口缓存失效。 */
    public AiPreferenceView save(Double temperature, Integer contextLength, String modelName) {
        if (temperature != null && (Double.isNaN(temperature) || temperature < 0 || temperature > 1)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "temperature 必须在 0-1 之间");
        }
        if (contextLength != null && !ALLOWED_CONTEXT_LENGTHS.contains(contextLength)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "contextLength 仅支持 4096/8192/16384");
        }
        String safeModelName = modelName == null || modelName.isBlank() ? null : modelName.trim();
        if (safeModelName != null && safeModelName.length() > 50) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "modelName 不能超过 50 字");
        }
        PreferenceStore.Preference saved = preferenceStore.save(
                ownerKey(), temperature, contextLength, safeModelName, Instant.now());
        chatMemoryManager.rebuildForOwner(saved.ownerKey());
        return AiPreferenceView.of(saved.temperature(), saved.contextLength(), saved.modelName(), saved.updatedAt());
    }

    /** 返回模型提供方、模型名、默认温度和记忆/偏好存储类型。 */
    public ModelInfoView modelInfo() {
        return new ModelInfoView(provider, providerLabel(provider), model, temperature,
                memoryStore, memoryLabel(memoryStore), true, true, preferenceStoreType,
                ALLOWED_CONTEXT_LENGTHS);
    }

    /** 将模型提供方标识转换为管理端可读名称。 */
    private String providerLabel(String provider) {
        return switch (provider) {
            case "dev" -> "本地模拟（dev-mock）";
            case "openai" -> "OpenAI 兼容在线模型";
            default -> provider;
        };
    }

    /** 将记忆存储标识转换为管理端可读名称。 */
    private String memoryLabel(String store) {
        return switch (store) {
            case "pg" -> "PostgreSQL 持久化";
            case "memory" -> "进程内内存";
            default -> store;
        };
    }

    /** 根据当前登录用户或设备生成偏好归属键。 */
    private String ownerKey() {
        AuthContext.Context context = AuthContext.get();
        if (context.userId() != null) {
            return "user:" + context.userId();
        }
        if (context.deviceId() == null || context.deviceId().isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 X-Device-Id 请求头");
        }
        return "device:" + context.deviceId();
    }
}
