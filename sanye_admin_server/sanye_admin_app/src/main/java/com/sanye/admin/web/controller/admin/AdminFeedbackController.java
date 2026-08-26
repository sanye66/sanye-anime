package com.sanye.admin.web.controller.admin;

import com.sanye.admin.common.core.domain.AjaxResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 反馈管理代理接口（T-F-03 第二批）：RuoYi 经服务间调用访问 feedback 服务受控接口。
 */
@RestController
@RequestMapping("/feedback")
public class AdminFeedbackController {

    private final RestClient restClient = RestClient.create();
    private final String feedbackServiceUrl;
    private final String manageToken;

    /** 注入反馈服务地址和服务间令牌，集中维护代理调用凭证。 */
    public AdminFeedbackController(
            @Value("${sanye-admin.feedback-service-url:http://localhost:8087}") String feedbackServiceUrl,
            @Value("${sanye-admin.manage-token:}") String manageToken) {
        this.feedbackServiceUrl = feedbackServiceUrl;
        this.manageToken = manageToken;
    }

    /** 代理查询反馈管理列表。 */
    @GetMapping
    @PreAuthorize("@ss.hasPermi('feedback:list')")
    public AjaxResult list() {
        return unwrap(restClient.get()
                .uri(feedbackServiceUrl + "/api/v1/manage/feedback")
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .retrieve()
                .body(Map.class));
    }

    /** 代理更新反馈处理状态。 */
    @PatchMapping("/{id}")
    @PreAuthorize("@ss.hasPermi('feedback:status')")
    public AjaxResult updateStatus(@PathVariable long id, @RequestBody Map<String, String> request) {
        return unwrap(restClient.patch()
                .uri(feedbackServiceUrl + "/api/v1/manage/feedback/{id}", id)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("status", request.getOrDefault("status", "")))
                .retrieve()
                .body(Map.class));
    }

    /** 转换业务服务响应，隐藏下游内部错误结构。 */
    @SuppressWarnings("unchecked")
    private AjaxResult unwrap(Map<String, Object> body) {
        if (body != null && Integer.valueOf(0).equals(body.get("code"))) {
            return AjaxResult.success(body.get("data"));
        }
        return AjaxResult.error("业务服务返回异常");
    }
}
