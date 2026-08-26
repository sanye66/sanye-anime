package com.sanye.admin.web.controller.admin;

import com.sanye.admin.common.core.domain.AjaxResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端仪表盘统计（真实数据）：经服务间调用聚合 anime/feedback 业务数据，
 * 本地统计任务与用户；受 RuoYi 安全链保护（需登录管理员）。
 */
@RestController
@RequestMapping("/dashboard")
public class AdminDashboardController {

    private final RestClient restClient = RestClient.create();
    private final String animeServiceUrl;
    private final String feedbackServiceUrl;
    private final String aiServiceUrl;
    private final String manageToken;
    private final JdbcTemplate jdbc;

    /** 统计快照本地 TTL 缓存（5 秒），避免每次请求串行聚合三个业务服务 */
    private static final long CACHE_TTL_MS = 5_000L;
    private volatile Map<String, Object> cachedStats;
    private volatile long cachedAt;

    /** 注入下游业务地址、服务间令牌和管理库查询模板。 */
    public AdminDashboardController(
            @Value("${sanye-admin.anime-service-url:http://localhost:8082}") String animeServiceUrl,
            @Value("${sanye-admin.feedback-service-url:http://localhost:8087}") String feedbackServiceUrl,
            @Value("${sanye-admin.ai-service-url:http://localhost:8084}") String aiServiceUrl,
            @Value("${sanye-admin.manage-token:}") String manageToken,
            JdbcTemplate jdbc) {
        this.animeServiceUrl = animeServiceUrl;
        this.feedbackServiceUrl = feedbackServiceUrl;
        this.aiServiceUrl = aiServiceUrl;
        this.manageToken = manageToken;
        this.jdbc = jdbc;
    }

    /** 返回带 5 秒本地缓存的仪表盘统计快照。 */
    @GetMapping("/stats")
    @PreAuthorize("isAuthenticated()")
    public AjaxResult stats() {
        long now = System.currentTimeMillis();
        Map<String, Object> data = cachedStats;
        if (data == null || now - cachedAt > CACHE_TTL_MS) {
            synchronized (this) {
                data = cachedStats;
                if (data == null || System.currentTimeMillis() - cachedAt > CACHE_TTL_MS) {
                    data = buildStats();
                    cachedStats = data;
                    cachedAt = System.currentTimeMillis();
                }
            }
        }
        return AjaxResult.success(data);
    }

    /** 聚合动画、反馈、AI、任务和用户统计，转换为前端仪表盘字段。 */
    private Map<String, Object> buildStats() {
        List<Map<String, Object>> animeRows = callList(animeServiceUrl + "/api/v1/manage/anime");
        List<Map<String, Object>> feedbackRows = callList(feedbackServiceUrl + "/api/v1/manage/feedback");
        Map<String, Object> aiStats = callData(aiServiceUrl + "/api/v1/manage/ai/stats");
        long jobs = count("select count(*) from sanye_sys_job");
        long failedJobs = count("select count(*) from sanye_sys_job_log where status = '1'");
        long users = count("select count(*) from sanye_sys_user");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("animeTotal", animeRows.size());
        data.put("animePublished", countByStatus(animeRows, "已发布"));
        data.put("animeReview", countByStatus(animeRows, "待审核"));
        data.put("animeOffline", countByStatus(animeRows, "已下架"));
        data.put("feedbackTotal", feedbackRows.size());
        data.put("feedbackPending", countByStatus(feedbackRows, "待处理"));
        data.put("feedbackProcessing", countByStatus(feedbackRows, "处理中"));
        data.put("feedbackClosed", countByStatus(feedbackRows, "已关闭"));
        data.put("jobs", jobs);
        data.put("failedJobs", failedJobs);
        data.put("users", users);
        data.put("aiTotalConversations", num(aiStats.get("totalConversations")));
        data.put("aiTotalMessages", num(aiStats.get("totalMessages")));
        data.put("aiTodayConversations", num(aiStats.get("todayConversations")));
        data.put("aiTodayMessages", num(aiStats.get("todayMessages")));
        data.put("aiTotalPromptTokens", num(aiStats.get("totalPromptTokens")));
        data.put("aiTotalCompletionTokens", num(aiStats.get("totalCompletionTokens")));
        data.put("aiTotalCostCents", num(aiStats.get("totalCostCents")));
        data.put("aiTodayCostCents", num(aiStats.get("todayCostCents")));
        data.put("aiUsageTrend", aiStats.getOrDefault("usageTrend", List.of()));
        return data;
    }

    @SuppressWarnings("unchecked")
    /** 调用下游列表接口并将列表包装成统一内部结构。 */
    private List<Map<String, Object>> callList(String url) {
        Object data = callData(url).get("__list__");
        if (!(data instanceof List)) {
            return List.of();
        }
        return (List<Map<String, Object>>) data;
    }

    @SuppressWarnings("unchecked")
    /** 调用下游统一接口，兼容 data 为列表或对象两种响应形态。 */
    private Map<String, Object> callData(String url) {
        Map<String, Object> body = restClient.get()
                .uri(url)
                .header("X-Caller-Name", "sanye-admin-server")
                .header("X-Internal-Token", manageToken)
                .retrieve()
                .body(Map.class);
        if (body == null || !Integer.valueOf(0).equals(body.get("code"))) {
            return Map.of();
        }
        if (body.get("data") instanceof List) {
            return Map.of("__list__", body.get("data"));
        }
        if (body.get("data") instanceof Map) {
            return (Map<String, Object>) body.get("data");
        }
        return Map.of();
    }

    /** 统计聚合结果中指定业务状态的记录数量。 */
    private long countByStatus(List<Map<String, Object>> rows, String status) {
        return rows.stream().filter(row -> status.equals(row.get("status"))).count();
    }

    /** 执行本地管理库单值统计查询。 */
    private long count(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }

    /** 将下游数字字段安全转换为 long，缺失字段按零处理。 */
    private long num(Object value) {
        return value instanceof Number number ? number.longValue() : 0;
    }
}
