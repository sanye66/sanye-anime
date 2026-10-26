package com.sanye.anime.sanye_gateway;

import org.junit.jupiter.api.Test;
import com.sanye.anime.sanye_core.auth.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayAuthFilterTest {

    private final GatewayAuthFilter filter = new GatewayAuthFilter("test-secret", 1800);
    private final JwtService jwtService = new JwtService("test-secret", 1800);

    @Test
    void publicPathPassesWithoutDeviceId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/public/home"));
        AtomicBoolean chained = new AtomicBoolean(false);

        StepVerifier.create(filter.filter(exchange, ex -> {
            chained.set(true);
            return Mono.empty();
        })).verifyComplete();

        assertTrue(chained.get());
    }

    @Test
    void pingIsPublic() {
        assertTrue(GatewayAuthFilter.isPublic("/api/v1/system/ping"));
        assertTrue(GatewayAuthFilter.isPublic("/covers/anime-1.svg"));
        assertTrue(GatewayAuthFilter.isPublic("/admin-profile/profile/upload/cover.jpg"));
        assertTrue(GatewayAuthFilter.isPublic("/actuator/health"));
        assertTrue(GatewayAuthFilter.isPublic("/api/v1/monitor/frontend-errors"));
        assertFalse(GatewayAuthFilter.isPublic("/api/v1/monitor/private"));
        assertFalse(GatewayAuthFilter.isPublic("/actuator/env"));
        assertFalse(GatewayAuthFilter.isPublic("/actuator/prometheus"));
        assertFalse(GatewayAuthFilter.isPublic("/api/v1/files/1"));
        assertFalse(GatewayAuthFilter.isPublic("/api/v1/home"));
        assertFalse(GatewayAuthFilter.isPublic("/api/v1/ai/quota"));
    }

    @Test
    void protectedPathRejectsMissingDeviceId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home")
                        .header(GatewayFilters.REQUEST_ID_HEADER, "req-123"));
        AtomicBoolean chained = new AtomicBoolean(false);

        StepVerifier.create(filter.filter(exchange, ex -> {
            chained.set(true);
            return Mono.empty();
        })).verifyComplete();

        assertFalse(chained.get());
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void protectedPathPassesWithDeviceId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home").header(GatewayAuthFilter.DEVICE_ID_HEADER, "device-1"));
        AtomicBoolean chained = new AtomicBoolean(false);

        StepVerifier.create(filter.filter(exchange, ex -> {
            chained.set(true);
            return Mono.empty();
        })).verifyComplete();

        assertTrue(chained.get());
    }

    @Test
    void validBearerInjectsUserIdAndPasses() {
        String token = jwtService.issue(7, "sanye-user");
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home").header("Authorization", "Bearer " + token)
                        .header(GatewayAuthFilter.USER_ID_HEADER, "999")
                        .header("X-Internal-Token", "forged-internal-token"));
        AtomicBoolean chained = new AtomicBoolean(false);

        StepVerifier.create(filter.filter(exchange, ex -> {
            chained.set(true);
            assertTrue("7".equals(ex.getRequest().getHeaders().getFirst(GatewayAuthFilter.USER_ID_HEADER)));
            assertEquals(null, ex.getRequest().getHeaders().getFirst("X-Internal-Token"));
            return Mono.empty();
        })).verifyComplete();

        assertTrue(chained.get());
    }

    @Test
    void anonymousClientCannotForgeUserId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home")
                        .header(GatewayAuthFilter.DEVICE_ID_HEADER, "device-1")
                        .header(GatewayAuthFilter.USER_ID_HEADER, "999"));
        AtomicBoolean chained = new AtomicBoolean(false);

        StepVerifier.create(filter.filter(exchange, ex -> {
            chained.set(true);
            assertEquals(null, ex.getRequest().getHeaders().getFirst(GatewayAuthFilter.USER_ID_HEADER));
            return Mono.empty();
        })).verifyComplete();

        assertTrue(chained.get());
    }

    @Test
    void invalidBearerRejects() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home")
                        .header("Authorization", "Bearer bad-token"));

        StepVerifier.create(filter.filter(exchange, ex -> Mono.empty())).verifyComplete();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void externalInternalTokenAndUserIdentityAreRemovedOnEveryBranch() {
        for (String path : java.util.List.of("/api/v1/public/home", "/api/v1/home", "/api/v1/admin/login")) {
            MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get(path)
                    .header(GatewayAuthFilter.DEVICE_ID_HEADER, "device-1")
                    .header(GatewayAuthFilter.USER_ID_HEADER, "999")
                    .header("X-Caller-Name", "forged-service")
                    .header("X-Internal-Token", "forged-internal-token"));
            AtomicBoolean chained = new AtomicBoolean(false);
            StepVerifier.create(filter.filter(exchange, ex -> {
                chained.set(true);
                assertEquals(null, ex.getRequest().getHeaders().getFirst(GatewayAuthFilter.USER_ID_HEADER));
                assertEquals(null, ex.getRequest().getHeaders().getFirst("X-Internal-Token"));
                assertEquals(null, ex.getRequest().getHeaders().getFirst("X-Caller-Name"));
                return Mono.empty();
            })).verifyComplete();
            assertTrue(chained.get());
        }
    }

    @Test
    void managementListenerDefaultsToLoopbackAndAllowsExplicitNetworkBinding() throws Exception {
        var environment = new org.springframework.mock.env.MockEnvironment();
        for (var source : new org.springframework.boot.env.YamlPropertySourceLoader().load("gateway",
                new org.springframework.core.io.ClassPathResource("application.yml"))) {
            environment.getPropertySources().addLast(source);
        }
        assertEquals("127.0.0.1", environment.getProperty("management.server.address"));
        environment.setProperty("MANAGEMENT_ADDRESS", "0.0.0.0");
        assertEquals("0.0.0.0", environment.getProperty("management.server.address"));
    }
}
