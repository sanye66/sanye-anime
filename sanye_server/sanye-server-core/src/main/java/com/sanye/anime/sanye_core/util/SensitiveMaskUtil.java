package com.sanye.anime.sanye_core.util;

/**
 * 日志与响应脱敏工具。正式接入时在序列化层统一应用。
 */
public final class SensitiveMaskUtil {

    /** 脱敏工具类禁止实例化。 */
    private SensitiveMaskUtil() {
    }

    /** 保留手机号首尾信息，隐藏中间号码，兼容过短输入和空值。 */
    public static String maskPhone(String value) {
        if (value == null || value.length() < 7) {
            return value;
        }
        return value.substring(0, 3) + "****" + value.substring(value.length() - 4);
    }

    /** 保留邮箱首字符和域名，避免日志泄露完整邮箱地址。 */
    public static String maskEmail(String value) {
        if (value == null || !value.contains("@")) {
            return value;
        }
        int at = value.indexOf('@');
        String prefix = value.substring(0, at);
        if (prefix.length() <= 1) {
            return "*" + value.substring(at);
        }
        return prefix.substring(0, 1) + "****" + value.substring(at);
    }

    /** 仅保留令牌前缀用于定位请求，禁止把完整凭证写入日志。 */
    public static String maskToken(String value) {
        if (value == null || value.length() < 8) {
            return value;
        }
        return value.substring(0, 4) + "****";
    }
}
