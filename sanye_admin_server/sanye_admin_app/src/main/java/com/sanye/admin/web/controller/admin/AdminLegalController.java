package com.sanye.admin.web.controller.admin;

import com.sanye.admin.common.core.domain.AjaxResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 官网正文（法律文档）管理代理接口（T-D-07）：RuoYi 经服务间调用访问 anime 服务
 * 受控管理接口，X-Caller-Name 作为服务间凭证；本控制器受 RuoYi 安全链与
 * 方法级权限（legal:content:list / legal:content:edit）双重保护。
 */
@RestController
@RequestMapping("/legal")
public class AdminLegalController {

    private final RestClient restClient = RestClient.create();
    private final String animeServiceUrl;
    private final String manageToken;

    /** 注入官网正文所在动漫服务地址和服务间令牌。 */
    public AdminLegalController(
            @Value("${sanye-admin.anime-service-url:http://localhost:8082}") String animeServiceUrl,
            @Value("${sanye-admin.manage-token:}") String manageToken) {
        this.animeServiceUrl = animeServiceUrl;
        this.manageToken = manageToken;
    }

    /** 代理查询官网法律正文列表。 */
    @GetMapping
    @PreAuthorize("@ss.hasPermi('legal:content:list')")
    public AjaxResult list() {
        return unwrap(restClient.get()
                .uri(animeServiceUrl + "/api/v1/manage/legal")
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .retrieve()
                .body(Map.class));
    }

    /** 代理保存或发布单篇官网法律正文。 */
    @PutMapping("/{key}")
    @PreAuthorize("@ss.hasPermi('legal:content:edit')")
    public AjaxResult update(@PathVariable String key, @RequestBody Map<String, String> request) {
        return unwrap(restClient.put()
                .uri(animeServiceUrl + "/api/v1/manage/legal/{key}", key)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "title", request.getOrDefault("title", ""),
                        "content", request.getOrDefault("content", ""),
                        "status", request.getOrDefault("status", "草稿")))
                .retrieve()
                .body(Map.class));
    }

    /** 将下游统一响应转换为管理端 AjaxResult。 */
    @SuppressWarnings("unchecked")
    private AjaxResult unwrap(Map<String, Object> body) {
        if (body != null && Integer.valueOf(0).equals(body.get("code"))) {
            return AjaxResult.success(body.get("data"));
        }
        return AjaxResult.error("业务服务返回异常");
    }
}
