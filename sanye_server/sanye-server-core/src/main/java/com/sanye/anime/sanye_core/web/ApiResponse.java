package com.sanye.anime.sanye_core.web;

/**
 * 统一响应结构，与 docs/api-contract.md 保持一致。
 */
public record ApiResponse<T>(int code, String message, T data, String requestId) {

    /** 构造成功响应，并保留链路请求编号供前端排查问题。 */
    public static <T> ApiResponse<T> ok(T data, String requestId) {
        return new ApiResponse<>(0, "ok", data, requestId);
    }

    /** 构造失败响应；失败响应不返回业务数据，避免误用旧数据。 */
    public static <T> ApiResponse<T> error(int code, String message, String requestId) {
        return new ApiResponse<>(code, message, null, requestId);
    }
}
