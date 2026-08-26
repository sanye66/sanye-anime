package com.sanye.anime.sanye_gateway;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayErrorResponseFilterTest {

    private final GatewayErrorResponseFilter filter = new GatewayErrorResponseFilter();

    @Test
    void rewritesUpstream5xxToUnifiedErrorWithRequestId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/anime/1")
                        .header(GatewayFilters.REQUEST_ID_HEADER, "req-fault-001"));

        StepVerifier.create(filter.filter(exchange, ex -> {
            ex.getResponse().setStatusCode(HttpStatus.BAD_GATEWAY);
            return Mono.empty();
        })).verifyComplete();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
        String body = exchange.getResponse().getBodyAsString().block();
        assertTrue(body.contains("\"code\":5002"), body);
        assertTrue(body.contains("\"requestId\":\"req-fault-001\""), body);
    }

    @Test
    void leavesSuccessfulResponseUntouched() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/home"));

        StepVerifier.create(filter.filter(exchange, ex -> {
            ex.getResponse().setStatusCode(HttpStatus.OK);
            return Mono.empty();
        })).verifyComplete();

        assertEquals(HttpStatus.OK, exchange.getResponse().getStatusCode());
    }

    @Test
    void leavesCommitted5xxUntouched() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/ai/quota"));

        StepVerifier.create(filter.filter(exchange, ex -> {
            ex.getResponse().setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            return ex.getResponse().writeWith(Mono.just(ex.getResponse().bufferFactory()
                    .wrap("already".getBytes(StandardCharsets.UTF_8))));
        })).verifyComplete();

        String body = exchange.getResponse().getBodyAsString().block();
        assertEquals("already", body, "已提交响应不应被改写");
    }
}
