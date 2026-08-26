package com.sanye.anime.sanye_gateway;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayFiltersTest {

    private final GatewayFilters filters = new GatewayFilters();

    @Test
    void injectsRequestIdWhenMissing() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/home"));
        AtomicReference<String> seen = new AtomicReference<>();

        StepVerifier.create(filters.filter(exchange, ex -> {
            seen.set(ex.getRequest().getHeaders().getFirst(GatewayFilters.REQUEST_ID_HEADER));
            return Mono.empty();
        })).verifyComplete();

        assertNotNull(seen.get());
        assertFalse(seen.get().isBlank());
    }

    @Test
    void keepsExistingRequestId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/home").header(GatewayFilters.REQUEST_ID_HEADER, "req-existing"));
        AtomicReference<String> seen = new AtomicReference<>();

        StepVerifier.create(filters.filter(exchange, ex -> {
            seen.set(ex.getRequest().getHeaders().getFirst(GatewayFilters.REQUEST_ID_HEADER));
            return Mono.empty();
        })).verifyComplete();

        assertTrue("req-existing".equals(seen.get()));
    }
}
