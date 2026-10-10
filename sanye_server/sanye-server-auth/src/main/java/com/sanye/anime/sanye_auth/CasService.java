package com.sanye.anime.sanye_auth;

import com.sanye.anime.sanye_core.auth.JwtService;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CAS 单点登录服务（T-F-01 本地联调）：
 * - /cas/login 返回 CAS 登录跳转地址（dev 使用本地 Mock CAS，正式替换为真实 CAS）；
 * - ticket 经 /serviceValidate 校验（一次性），提取 CAS 主体；
 * - 账号映射/自动建号（sanye_user_auth + sanye_user_account）；
 * - 签发本地会话凭证（JWT access + refresh）。
 */
@Service
public class CasService {

    private static final Logger log = LoggerFactory.getLogger(CasService.class);
    private static final Pattern USER_PATTERN = Pattern.compile("<cas:user>([^<]+)</cas:user>");

    private final RestClient restClient = RestClient.create();
    private final JdbcTemplate jdbc;
    private final JwtService jwtService;
    private final String casServerUrl;
    private final String schema;

    /** 注入用户和令牌存储配置，负责 CAS 票据到本地会话的转换。 */
    public CasService(JdbcTemplate jdbc,
                      @Value("${sanye.auth.cas-server-url:http://localhost:8095}") String casServerUrl,
                      @Value("${sanye.auth.schema:sanye_auth}") String schema,
                      @Value("${sanye.auth.token-secret}") String tokenSecret,
                      @Value("${sanye.auth.access-ttl-seconds:1800}") long accessTtlSeconds) {
        this.jdbc = jdbc;
        this.jwtService = new JwtService(tokenSecret, accessTtlSeconds);
        this.casServerUrl = casServerUrl;
        this.schema = schema;
    }

    /** 规范化回调地址并生成 CAS 登录 URL。 */
    public Map<String, String> loginUrl(String service) {
        String safe = service == null || service.isBlank() ? "http://localhost:5173/" : service;
        return Map.of("redirectUrl",
                casServerUrl + "/cas/login?service=" + encode(safe));
    }

    /** 验证一次性 ticket，自动建号并创建本地双令牌会话。 */
    public Map<String, Object> handleCallback(String ticket, String service) {
        if (ticket == null || ticket.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 CAS ticket");
        }
        String casUser = validateTicket(ticket, service);
        boolean isNewAccount = false;
        Long userId = findUserIdByCas(casUser);
        if (userId == null) {
            userId = createAccount(casUser);
            isNewAccount = true;
            log.info("CAS 自动建号 userId={} casUser={}", userId, casUser);
        }
        String accessToken = jwtService.issue(userId, casUser);
        String refreshToken = "rt-" + UUID.randomUUID();
        persistRefreshToken(userId, refreshToken);
        Map<String, Object> session = new LinkedHashMap<>();
        session.put("accessToken", accessToken);
        session.put("refreshToken", refreshToken);
        session.put("expiresIn", 1800);
        session.put("isNewAccount", isNewAccount);
        session.put("user", Map.of("id", userId, "username", casUser, "nickname", casUser));
        log.info("CAS 登录成功 userId={} casUser={} isNewAccount={}", userId, casUser, isNewAccount);
        return session;
    }

    /**
     * refresh 轮换：旧 refreshToken 一次性使用后立即失效（防复用），签发新 access + refresh。
     */
    /** 原子轮换 refreshToken，旧令牌更新后立即失效。 */
    public Map<String, Object> refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 refreshToken");
        }
        AuthRow row = findByRefreshToken(refreshToken);
        if (row == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "refreshToken 无效或已使用");
        }
        String newRefresh = "rt-" + UUID.randomUUID();
        jdbc.update("update " + schema + ".sanye_user_auth set refresh_token_id = ? where id = ?",
                newRefresh, row.authId());
        Map<String, Object> session = new LinkedHashMap<>();
        session.put("accessToken", jwtService.issue(row.userId(), row.username()));
        session.put("refreshToken", newRefresh);
        session.put("expiresIn", 1800);
        session.put("user", Map.of("id", row.userId(), "username", row.username(), "nickname", row.username()));
        log.info("refresh 轮换成功 userId={}", row.userId());
        return session;
    }

    /**
     * 退出：吊销本地 refresh（accessToken 短时自然过期），返回 CAS 登出地址。
     */
    /** 清空本地 refreshToken，短时 accessToken等待自然过期。 */
    public Map<String, String> logout(String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            jdbc.update("update " + schema + ".sanye_user_auth set refresh_token_id = null "
                    + "where refresh_token_id = ?", refreshToken);
        }
        return Map.of("redirectUrl", casServerUrl + "/cas/logout");
    }

    /** 调用 CAS serviceValidate，并从响应 XML 提取主体账号。 */
    private String validateTicket(String ticket, String service) {
        // 传原始值，由 RestClient 统一编码 query 参数，避免二次编码导致 service 不匹配
        String uri = casServerUrl + "/cas/serviceValidate?ticket=" + ticket
                + "&service=" + (service == null ? "" : service);
        String xml;
        try {
            xml = restClient.get().uri(uri).retrieve().body(String.class);
        } catch (RuntimeException ex) {
            log.warn("CAS serviceValidate 调用失败 uri={} error={}", uri, ex.getMessage());
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "CAS 服务暂不可用");
        }
        Matcher matcher = USER_PATTERN.matcher(xml == null ? "" : xml);
        if (!matcher.find()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "CAS ticket 校验失败");
        }
        return matcher.group(1).trim();
    }

    /** 按 CAS 主体查询已绑定的本地用户编号。 */
    private Long findUserIdByCas(String casUser) {
        List<Long> rows = jdbc.query(
                "select u.id from " + schema + ".sanye_user_auth a "
                        + "join " + schema + ".sanye_user_account u on u.id = a.user_id "
                        + "where a.auth_type = 'CAS' and a.cas_user_id = ?",
                (rs, rowNum) -> rs.getLong(1), casUser);
        return rows.stream().findFirst().orElse(null);
    }

    /** 将刷新令牌写入当前用户认证记录。 */
    private void persistRefreshToken(long userId, String refreshToken) {
        jdbc.update("update " + schema + ".sanye_user_auth set refresh_token_id = ? "
                + "where auth_type = 'CAS' and user_id = ?", refreshToken, userId);
    }

    /** 按刷新令牌查找用户和认证记录，未找到即视为令牌失效。 */
    private AuthRow findByRefreshToken(String refreshToken) {
        List<AuthRow> rows = jdbc.query(
                "select a.id, u.id, u.username from " + schema + ".sanye_user_auth a "
                        + "join " + schema + ".sanye_user_account u on u.id = a.user_id "
                        + "where a.refresh_token_id = ?",
                (rs, rowNum) -> new AuthRow(rs.getLong(1), rs.getLong(2), rs.getString(3)), refreshToken);
        return rows.stream().findFirst().orElse(null);
    }

    private record AuthRow(long authId, long userId, String username) {
    }

    /** 创建本地账户及 CAS 绑定关系，供首次登录自动建号。 */
    private Long createAccount(String casUser) {
        Long userId = jdbc.queryForObject(
                "insert into " + schema + ".sanye_user_account (username, status) values (?, 'ACTIVE') returning id",
                Long.class, casUser);
        jdbc.update("insert into " + schema + ".sanye_user_auth (user_id, auth_type, cas_user_id) values (?, 'CAS', ?)",
                userId, casUser);
        return userId;
    }

    /** 对登录回调地址进行 URL 编码，避免参数破坏 CAS 查询串。 */
    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
