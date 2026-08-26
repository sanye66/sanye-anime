package com.sanye.anime.sanye_core.feign;

import com.sanye.anime.sanye_core.exception.ErrorCode;
import feign.Response;
import feign.codec.ErrorDecoder;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 将下游响应状态映射为统一业务错误码（对齐接口契约 1.4 节）。
 */
@Component
public class SanyeFeignErrorDecoder implements ErrorDecoder {

    private final ErrorDecoder delegate = new Default();

    /** 将下游 HTTP 状态映射为统一业务异常，并保留下游错误正文。 */
    @Override
    public Exception decode(String methodKey, Response response) {
        int status = response.status();
        ErrorCode errorCode = switch (status) {
            case 401 -> ErrorCode.UNAUTHORIZED;
            case 403 -> ErrorCode.FORBIDDEN;
            case 404 -> ErrorCode.NOT_FOUND;
            case 429 -> ErrorCode.RATE_LIMITED;
            default -> ErrorCode.INTERNAL_ERROR;
        };
        String body = readBody(response);
        return new RemoteServiceException(status, errorCode.code(), body == null ? errorCode.message() : body);
    }

    /** 读取下游响应正文，读取失败时交给上层使用默认错误文案。 */
    private String readBody(Response response) {
        if (response.body() == null) {
            return null;
        }
        try (Response.Body body = response.body()) {
            byte[] bytes = body.asInputStream().readAllBytes();
            return new String(bytes, StandardCharsets.UTF_8).trim();
        } catch (IOException ignored) {
            return null;
        }
    }
}
