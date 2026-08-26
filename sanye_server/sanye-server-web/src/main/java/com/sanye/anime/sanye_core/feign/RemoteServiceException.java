package com.sanye.anime.sanye_core.feign;

/**
 * 下游服务调用失败统一异常，携带上游 HTTP 状态与业务错误码。
 */
public class RemoteServiceException extends RuntimeException {

    private final int status;
    private final int code;

    /** 保存下游 HTTP 状态和业务码，供 Feign 错误解码后统一处理。 */
    public RemoteServiceException(int status, int code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** 返回下游 HTTP 状态码。 */
    public int status() {
        return status;
    }

    /** 返回下游业务错误码。 */
    public int code() {
        return code;
    }
}
