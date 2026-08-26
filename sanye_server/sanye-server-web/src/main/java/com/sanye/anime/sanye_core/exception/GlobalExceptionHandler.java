package com.sanye.anime.sanye_core.exception;

import com.sanye.anime.sanye_core.web.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 统一异常处理：业务异常按 ErrorCode 映射，参数校验 1001，未知异常 5001。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.OK)
    /** 将已知业务异常转换为统一错误码响应。 */
    public ApiResponse<Void> handleBusiness(BusinessException ex) {
        return ApiResponse.error(ex.errorCode().code(), ex.getMessage(), requestId());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    /** 将参数校验异常转换为参数错误响应。 */
    public ApiResponse<Void> handleValidation(Exception ex) {
        return ApiResponse.error(ErrorCode.PARAM_INVALID.code(), ErrorCode.PARAM_INVALID.message(), requestId());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    /** 记录未知异常并隐藏内部堆栈，只向客户端返回通用错误。 */
    public ApiResponse<Void> handleUnknown(Exception ex) {
        log.error("未处理异常 type={} requestId={}", ex.getClass().getName(), requestId(), ex);
        return ApiResponse.error(ErrorCode.INTERNAL_ERROR.code(), ErrorCode.INTERNAL_ERROR.message(), requestId());
    }

    /** 从 MDC 读取当前请求编号，保证异常响应仍可追踪。 */
    private String requestId() {
        String rid = MDC.get("requestId");
        return rid == null ? "" : rid;
    }
}
