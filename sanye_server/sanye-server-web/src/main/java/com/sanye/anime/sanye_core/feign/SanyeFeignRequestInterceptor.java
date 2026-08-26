package com.sanye.anime.sanye_core.feign;

import com.sanye.anime.sanye_core.auth.AuthContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Feign 调用头透传：requestId、用户上下文、调用方服务名，
 * 供下游日志关联与审计使用（设计 8.1 节）。
 */
@Component
public class SanyeFeignRequestInterceptor implements RequestInterceptor {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String DEVICE_ID_HEADER = "X-Device-Id";
    public static final String CALLER_HEADER = "X-Caller-Name";
    public static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final String callerName;
    private final String internalToken;

    /** 注入当前服务名和内部令牌，统一生成服务间请求头。 */
    public SanyeFeignRequestInterceptor(@Value("${spring.application.name:unknown}") String callerName,
                                        @Value("${sanye.manage.internal-token:}") String internalToken) {
        this.callerName = callerName;
        this.internalToken = internalToken;
    }

    /** 透传请求编号、用户/设备上下文、调用方和内部令牌。 */
    @Override
    public void apply(RequestTemplate template) {
        String requestId = MDC.get("requestId");
        if (requestId != null && !requestId.isBlank()) {
            template.header(REQUEST_ID_HEADER, requestId);
        }
        AuthContext.Context context = AuthContext.get();
        if (context.userId() != null) {
            template.header(USER_ID_HEADER, String.valueOf(context.userId()));
        }
        if (context.deviceId() != null && !context.deviceId().isBlank()) {
            template.header(DEVICE_ID_HEADER, context.deviceId());
        }
        template.header(CALLER_HEADER, callerName);
        if (internalToken != null && !internalToken.isBlank()) {
            template.header(INTERNAL_TOKEN_HEADER, internalToken);
        }
    }
}
