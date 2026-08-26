package com.sanye.anime.sanye_core.feign;

import com.sanye.anime.sanye_core.auth.AuthContext;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SanyeFeignRequestInterceptorTest {

    private final SanyeFeignRequestInterceptor interceptor =
            new SanyeFeignRequestInterceptor("sanye-server-test", "");

    @BeforeEach
    void setUp() {
        MDC.put("requestId", "rid-feign");
        AuthContext.set(new AuthContext.Context(42L, "device-1", false));
    }

    @AfterEach
    void tearDown() {
        MDC.remove("requestId");
        AuthContext.clear();
    }

    @Test
    void propagatesRequestIdUserDeviceAndCaller() {
        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertEquals(List.of("rid-feign"), template.headers().get("X-Request-Id"));
        assertEquals(List.of("42"), template.headers().get("X-User-Id"));
        assertEquals(List.of("device-1"), template.headers().get("X-Device-Id"));
        assertEquals(List.of("sanye-server-test"), template.headers().get("X-Caller-Name"));
    }

    @Test
    void anonymousContextOmitsUserId() {
        AuthContext.clear();
        AuthContext.set(new AuthContext.Context(null, "device-2", true));
        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertEquals(null, template.headers().get("X-User-Id"));
        assertEquals(List.of("device-2"), template.headers().get("X-Device-Id"));
    }

    @Test
    void configuredInternalTokenIsPropagated() {
        RequestTemplate template = new RequestTemplate();
        new SanyeFeignRequestInterceptor("sanye-server-test", "shared-token").apply(template);

        assertEquals(List.of("shared-token"), template.headers().get("X-Internal-Token"));
    }
}
