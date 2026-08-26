package com.sanye.anime.sanye_core.exception;

/**
 * 错误码表，与 docs/api-contract.md 第 1.4 节一致。
 */
public enum ErrorCode {
    OK(0, "ok"),
    PARAM_INVALID(1001, "参数校验失败"),
    RATE_LIMITED(1002, "请求过于频繁"),
    UNAUTHORIZED(2001, "未登录或凭证过期"),
    FORBIDDEN(2002, "无权限"),
    NOT_FOUND(2003, "资源不存在或不可见"),
    BAD_STATE(3001, "业务状态不允许"),
    QUOTA_EXHAUSTED(3002, "额度用尽"),
    AI_PROVIDER_ERROR(4001, "AI 服务暂不可用"),
    SEARCH_UNAVAILABLE(4002, "搜索暂不可用"),
    SERVICE_UNAVAILABLE(5002, "服务暂不可用，请稍后重试"),
    INTERNAL_ERROR(5001, "服务内部错误");

    private final int code;
    private final String message;

    /** 保存稳定错误码和默认中文文案，供统一响应层读取。 */
    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    /** 返回对外稳定的数字错误码。 */
    public int code() {
        return code;
    }

    /** 返回默认中文错误文案。 */
    public String message() {
        return message;
    }
}
