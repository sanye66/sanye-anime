package com.sanye.anime.sanye_core.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 验证服务间管理调用令牌，避免仅凭可伪造的服务名请求受控写接口。
 */
public final class InternalCallerToken {

    /** 服务间令牌工具类禁止实例化。 */
    private InternalCallerToken() {
    }

    /** 以常量时间比较配置令牌和请求令牌，避免服务间凭证被伪造。 */
    public static boolean matches(String configured, String presented) {
        if (configured == null || configured.isBlank() || presented == null || presented.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(configured.getBytes(StandardCharsets.UTF_8),
                presented.getBytes(StandardCharsets.UTF_8));
    }
}
