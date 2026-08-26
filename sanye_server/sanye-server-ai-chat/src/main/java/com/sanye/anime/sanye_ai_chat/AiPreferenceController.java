package com.sanye.anime.sanye_ai_chat;

import com.sanye.anime.sanye_ai_chat.model.AiPreferenceView;
import com.sanye.anime.sanye_ai_chat.model.ModelInfoView;
import com.sanye.anime.sanye_ai_chat.model.SavePreferenceBody;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 模型配置接口（T-D-05）：偏好读写（设备/用户维度）+ 服务端模型状态（只读）。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiPreferenceController {

    private final AiPreferenceService aiPreferenceService;
    private final HttpServletRequest request;

    /** 注入偏好服务和当前请求对象，保持接口响应携带链路编号。 */
    public AiPreferenceController(AiPreferenceService aiPreferenceService, HttpServletRequest request) {
        this.aiPreferenceService = aiPreferenceService;
        this.request = request;
    }

    /** 查询当前归属人的 AI 偏好。 */
    @GetMapping("/preferences")
    public ApiResponse<AiPreferenceView> preferences() {
        return ApiResponse.ok(aiPreferenceService.get(), requestId());
    }

    /** 保存温度、上下文长度和模型名称偏好。 */
    @PutMapping("/preferences")
    public ApiResponse<AiPreferenceView> savePreferences(@RequestBody SavePreferenceBody body) {
        return ApiResponse.ok(aiPreferenceService.save(body.temperature(), body.contextLength(), body.modelName()),
                requestId());
    }

    /** 返回服务端实际启用的模型与存储状态。 */
    @GetMapping("/model-info")
    public ApiResponse<ModelInfoView> modelInfo() {
        return ApiResponse.ok(aiPreferenceService.modelInfo(), requestId());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
