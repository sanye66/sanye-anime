package com.sanye.anime.sanye_core.exception;

public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    /** 使用错误码默认文案构造业务异常。 */
    public BusinessException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
    }

    /** 使用错误码和业务场景文案构造业务异常。 */
    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    /** 返回异常对应的结构化错误码。 */
    public ErrorCode errorCode() {
        return errorCode;
    }
}
