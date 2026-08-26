package com.sanye.admin.web.controller.admin;

import com.sanye.admin.common.core.domain.AjaxResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 内容管理代理接口（T-F-03）：RuoYi 管理端经服务间调用访问业务服务（anime）的
 * 受控管理接口，X-Caller-Name 作为服务间凭证；本控制器本身受 RuoYi 安全链保护
 * （需登录管理员），构成角色二次校验。
 */
@RestController
@RequestMapping("/anime")
public class AdminAnimeController {

    private final RestClient restClient = RestClient.create();
    private final String animeServiceUrl;
    private final String manageToken;

    /** 注入动漫服务地址和服务间令牌，供所有代理请求统一携带凭证。 */
    public AdminAnimeController(
            @Value("${sanye-admin.anime-service-url:http://localhost:8082}") String animeServiceUrl,
            @Value("${sanye-admin.manage-token:}") String manageToken) {
        this.animeServiceUrl = animeServiceUrl;
        this.manageToken = manageToken;
    }

    /** 代理查询动画服务的作品管理列表。 */
    @GetMapping
    @PreAuthorize("@ss.hasPermi('anime:content:list')")
    public AjaxResult list() {
        Map<String, Object> body = restClient.get()
                .uri(animeServiceUrl + "/api/v1/manage/anime")
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 代理查询动画服务的作品管理详情。 */
    @GetMapping("/{id}")
    @PreAuthorize("@ss.hasPermi('anime:content:list')")
    public AjaxResult detail(@PathVariable long id) {
        Map<String, Object> body = restClient.get()
                .uri(animeServiceUrl + "/api/v1/manage/anime/{id}", id)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 代理创建作品草稿，并过滤掉未约定的请求字段。 */
    @PostMapping
    @PreAuthorize("@ss.hasPermi('anime:content:edit')")
    public AjaxResult create(@RequestBody Map<String, String> request) {
        Map<String, Object> body = restClient.post()
                .uri(animeServiceUrl + "/api/v1/manage/anime")
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(pick(request, "title", "originalTitle", "type", "year", "summary", "tags", "updateText",
                        "sourceUrl", "coverUrl"))
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 代理 URL 一键导入作品简介、封面和视频资源。 */
    @PostMapping("/import-url")
    @PreAuthorize("@ss.hasPermi('anime:content:edit')")
    public AjaxResult importUrl(@RequestBody Map<String, Object> request) {
        Map<String, Object> body = restClient.post()
                .uri(animeServiceUrl + "/api/v1/manage/anime/import-url")
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "sourceUrl", request.get("sourceUrl") == null ? "" : request.get("sourceUrl").toString(),
                        "publish", Boolean.TRUE.equals(request.get("publish"))))
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 代理更新作品内容，并保持管理端权限校验。 */
    @PatchMapping("/{id}")
    @PreAuthorize("@ss.hasPermi('anime:content:edit')")
    public AjaxResult update(@PathVariable long id, @RequestBody Map<String, String> request) {
        Map<String, Object> body = restClient.patch()
                .uri(animeServiceUrl + "/api/v1/manage/anime/{id}", id)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(pick(request, "title", "originalTitle", "type", "year", "summary", "tags", "updateText",
                        "sourceUrl", "coverUrl"))
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 从请求中挑选业务服务契约允许的字段，避免透传任意参数。 */
    private Map<String, String> pick(Map<String, String> source, String... keys) {
        Map<String, String> result = new java.util.HashMap<>();
        for (String key : keys) {
            if (source.containsKey(key)) {
                result.put(key, source.get(key));
            }
        }
        return result;
    }

    /** 代理更新作品发布状态。 */
    @PatchMapping("/{id}/status")
    @PreAuthorize("@ss.hasPermi('anime:content:status')")
    public AjaxResult updateStatus(@PathVariable long id, @RequestBody Map<String, String> request) {
        Map<String, Object> body = restClient.patch()
                .uri(animeServiceUrl + "/api/v1/manage/anime/{id}/status", id)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("status", request.getOrDefault("status", "")))
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 代理导入授权来源页面的剧集元数据，复用内容编辑权限和服务间凭证。 */
    @PostMapping("/{id}/episodes/import")
    @PreAuthorize("@ss.hasPermi('anime:content:edit')")
    public AjaxResult importEpisodes(@PathVariable long id, @RequestBody Map<String, String> request) {
        Map<String, Object> body = restClient.post()
                .uri(animeServiceUrl + "/api/v1/manage/anime/{id}/episodes/import", id)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("sourceUrl", request.get("sourceUrl") == null ? "" : request.get("sourceUrl")))
                .retrieve()
                .body(Map.class);
        return unwrap(body);
    }

    /** 将业务服务统一响应转换为 RuoYi AjaxResult。 */
    @SuppressWarnings("unchecked")
    private AjaxResult unwrap(Map<String, Object> body) {
        if (body != null && Integer.valueOf(0).equals(body.get("code"))) {
            return AjaxResult.success(body.get("data"));
        }
        return AjaxResult.error("业务服务返回异常");
    }
}
