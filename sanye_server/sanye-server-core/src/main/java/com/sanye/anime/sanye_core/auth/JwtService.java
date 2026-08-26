package com.sanye.anime.sanye_core.auth;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * 本地会话凭证 JWT（T-F-01 本地联调）：HS256 签发/校验，无第三方依赖。
 * 普通工具类（core 不依赖 Spring），由 auth/网关在构造时注入 secret 与有效期。
 */
public class JwtService {

    private static final String ALG = "HmacSHA256";
    private static final String HEADER = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

    private final SecretKeySpec key;
    private final long accessTtlSeconds;

    /** 注入签名密钥和访问令牌有效期，构造无 Spring 依赖的 JWT 工具。 */
    public JwtService(String secret, long accessTtlSeconds) {
        this.key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALG);
        this.accessTtlSeconds = accessTtlSeconds;
    }

    public record Claims(long userId, String username) {
    }

    /** 签发带用户编号、用户名和过期时间的 HS256 访问令牌。 */
    public String issue(long userId, String username) {
        long now = Instant.now().getEpochSecond();
        String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("{\"sub\":" + userId + ",\"username\":\"" + username
                        + "\",\"iat\":" + now + ",\"exp\":" + (now + accessTtlSeconds) + "}")
                        .getBytes(StandardCharsets.UTF_8));
        String signingInput = HEADER + "." + payload;
        return signingInput + "." + sign(signingInput);
    }

    /** 校验令牌格式、签名和过期时间；任何异常令牌都按无效处理。 */
    public Optional<Claims> verify(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return Optional.empty();
        }
        String expected = sign(parts[0] + "." + parts[1]);
        if (!constantTimeEquals(expected, parts[2])) {
            return Optional.empty();
        }
        try {
            String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            long exp = Long.parseLong(extract("exp", payload));
            if (exp < Instant.now().getEpochSecond()) {
                return Optional.empty();
            }
            long userId = Long.parseLong(extract("sub", payload));
            String username = extract("username", payload);
            return Optional.of(new Claims(userId, username));
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }

    /** 使用固定算法和注入的密钥计算签名，算法不可用时直接暴露配置错误。 */
    private String sign(String input) {
        try {
            Mac mac = Mac.getInstance(ALG);
            mac.init(key);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("JWT 签名失败", ex);
        }
    }

    /** 从当前 JWT 负载中提取指定字段，供轻量级本地令牌校验使用。 */
    private String extract(String field, String payload) {
        String key = "\"" + field + "\":";
        int start = payload.indexOf(key);
        if (start < 0) {
            throw new IllegalArgumentException("缺少字段 " + field);
        }
        int valueStart = start + key.length();
        int end = payload.indexOf(',', valueStart);
        if (end < 0) {
            end = payload.indexOf('}', valueStart);
        }
        String raw = payload.substring(valueStart, end).trim();
        return raw.startsWith("\"") ? raw.substring(1, raw.length() - 1) : raw;
    }

    /** 以固定时间比较签名，减少不同签名长度和前缀导致的时序泄露。 */
    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
