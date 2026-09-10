package com.sanye.admin.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.admin.common.exception.ServiceException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class XxlJobAdminService {
    private static final String UNAVAILABLE = "调度服务暂不可用，请检查配置或稍后刷新";
    private final ObjectMapper mapper;
    private final String url;
    private final String username;
    private final String password;
    private final int jobId;
    private final String appName;

    public XxlJobAdminService(ObjectMapper mapper,
            @Value("${sanye-admin.xxl-job.url:}") String url,
            @Value("${sanye-admin.xxl-job.username:}") String username,
            @Value("${sanye-admin.xxl-job.password:}") String password,
            @Value("${sanye-admin.xxl-job.job-id:0}") int jobId,
            @Value("${sanye-admin.xxl-job.executor-appname:}") String appName) {
        this.mapper = mapper;
        this.url = url.replaceAll("/+$", "");
        this.username = username;
        this.password = password;
        this.jobId = jobId;
        this.appName = appName;
    }

    public record JobStatus(boolean configured, int jobId, String jobName,
                            String executorAppName, boolean executorOnline) { }
    public record JobLog(long id, int jobId, String triggerTime, String handleTime,
                         int triggerCode, int handleCode, String status,
                         String triggerMessage, String handleMessage) { }
    public record LogPage(List<JobLog> rows, long total) { }
    private record Session(HttpClient client, int groupId, boolean registered) implements AutoCloseable {
        @Override public void close() { client.close(); }
    }

    public JobStatus status() {
        if (!configured()) return new JobStatus(false, 0, "rebuildAnimeIndex", "", false);
        try (Session session = session()) {
            return new JobStatus(true, jobId, "rebuildAnimeIndex", appName, session.registered());
        }
    }

    public LogPage logs(int pageNum, int pageSize, int statusFilter) {
        if (pageNum < 1 || pageSize < 1 || pageSize > 100 || pageNum > 100000)
            throw new ServiceException("分页参数无效");
        if (statusFilter != -1 && statusFilter != 1 && statusFilter != 2 && statusFilter != 3)
            throw new ServiceException("日志状态参数无效");
        try (Session session = session()) {
        JsonNode result = post(session.client(), "/joblog/pageList", Map.of(
                "start", String.valueOf((pageNum - 1) * pageSize), "length", String.valueOf(pageSize),
                "jobGroup", String.valueOf(session.groupId()), "jobId", String.valueOf(jobId),
                "logStatus", String.valueOf(statusFilter), "filterTime", ""));
        require(result.path("data").isArray() && result.path("recordsFiltered").canConvertToLong());
        List<JobLog> rows = new ArrayList<>();
        for (JsonNode row : result.path("data")) {
            require(row.path("jobId").asInt() == jobId && row.path("jobGroup").asInt() == session.groupId());
            int trigger = row.path("triggerCode").asInt();
            int handle = row.path("handleCode").asInt();
            String status = trigger != 0 && trigger != 200 || handle != 0 && handle != 200
                    ? "FAILED" : handle == 200 ? "SUCCESS" : trigger == 200 ? "RUNNING" : "PENDING";
            // Platform log messages contain HTML, addresses and stack traces; expose only outcome summaries.
            rows.add(new JobLog(row.path("id").asLong(), jobId, timestamp(row.get("triggerTime")),
                    timestamp(row.get("handleTime")), trigger, handle, status,
                    trigger == 200 ? "调度成功" : trigger == 0 ? "等待调度" : "调度失败，请检查执行器后重试",
                    handle == 200 ? "执行成功" : handle == 0 ? "等待执行结果" : "执行失败，请检查服务后重试"));
        }
        require(rows.size() <= pageSize && result.path("recordsFiltered").asLong() >= 0);
        return new LogPage(rows, result.path("recordsFiltered").asLong());
        }
    }

    public void run() {
        try (Session session = session()) {
        require(session.registered());
        JsonNode response = post(session.client(), "/jobinfo/trigger", Map.of(
                "id", String.valueOf(jobId), "executorParam", "", "addressList", ""));
        if (response.path("code").asInt() != 200)
            throw new ServiceException("调度提交未确认，请先刷新日志核对后再重试");
        }
    }

    private boolean configured() {
        return !url.isBlank() && !username.isBlank() && !password.isBlank() && jobId > 0 && !appName.isBlank();
    }

    private Session session() {
        require(configured());
        URI base;
        try { base = URI.create(url); } catch (IllegalArgumentException e) { throw unavailable(); }
        require(("http".equals(base.getScheme()) || "https".equals(base.getScheme()))
                && base.getHost() != null && base.getUserInfo() == null && base.getQuery() == null && base.getFragment() == null);
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER)).build();
        try {
        require(post(client, "/login", Map.of("userName", username, "password", password)).path("code").asInt() == 200);
        JsonNode groups = post(client, "/jobgroup/pageList", Map.of("start", "0", "length", "100", "appname", appName, "title", ""));
        require(groups.path("data").isArray());
        JsonNode group = null;
        for (JsonNode candidate : groups.path("data")) {
            if (appName.equals(candidate.path("appname").asText())) {
                require(group == null);
                group = candidate;
            }
        }
        require(group != null && group.path("id").asInt() > 0);
        int groupId = group.path("id").asInt();
        JsonNode jobs = post(client, "/jobinfo/pageList", Map.of("start", "0", "length", "100",
                "jobGroup", String.valueOf(groupId), "triggerStatus", "-1", "jobDesc", "",
                "executorHandler", "rebuildAnimeIndex", "author", ""));
        require(jobs.path("data").isArray());
        JsonNode job = null;
        for (JsonNode candidate : jobs.path("data")) if (candidate.path("id").asInt() == jobId) job = candidate;
        require(job != null && job.path("jobGroup").asInt() == groupId
                && "BEAN".equals(job.path("glueType").asText())
                && "rebuildAnimeIndex".equals(job.path("executorHandler").asText())
                && "DISCARD_LATER".equals(job.path("executorBlockStrategy").asText())
                && job.path("executorFailRetryCount").asInt(-1) == 0
                && job.path("executorParam").asText().isBlank());
        return new Session(client, groupId, group.path("registryList").isArray() && !group.path("registryList").isEmpty());
        } catch (RuntimeException e) {
            client.close();
            throw e;
        }
    }

    private JsonNode post(HttpClient client, String path, Map<String, String> params) {
        String body = params.entrySet().stream().map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
                .collect(Collectors.joining("&"));
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url + path)).timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            require(response.statusCode() == 200 && response.headers().firstValue("Content-Type")
                    .orElse("").toLowerCase(java.util.Locale.ROOT).contains("application/json"));
            JsonNode result = mapper.readTree(response.body());
            require(result != null && result.isObject());
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception e) {
            // A timed-out trigger may already have been accepted. Never automatically resubmit it.
            if ("/jobinfo/trigger".equals(path))
                throw new ServiceException("调度提交未确认，请先刷新日志核对后再重试");
            throw unavailable();
        }
    }

    private static String timestamp(JsonNode node) {
        if (node == null || node.isNull()) return null;
        String value = node.asText();
        return value.matches("[0-9T:.+ Z-]{1,40}") ? value : null;
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static void require(boolean valid) { if (!valid) throw unavailable(); }
    private static ServiceException unavailable() { return new ServiceException(UNAVAILABLE); }
}
