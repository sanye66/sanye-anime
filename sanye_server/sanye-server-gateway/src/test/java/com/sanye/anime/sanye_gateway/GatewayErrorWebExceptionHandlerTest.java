package com.sanye.anime.sanye_gateway;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.support.NotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayErrorWebExceptionHandlerTest {

    private final GatewayErrorWebExceptionHandler handler = new GatewayErrorWebExceptionHandler();

    @Test
    void upstreamFailureReturns503UnifiedError() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/anime/1")
                        .header(GatewayFilters.REQUEST_ID_HEADER, "req-err-001"));

        StepVerifier.create(handler.handle(exchange, new IllegalStateException("connection refused")))
                .verifyComplete();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
        String body = exchange.getResponse().getBodyAsString().block();
        assertTrue(body.contains("\"code\":5002"), body);
        assertTrue(body.contains("\"requestId\":\"req-err-001\""), body);
    }

    @Test
    void noRouteReturns404ResourceNotFound() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/unknown-path"));

        StepVerifier.create(handler.handle(exchange, new NotFoundException("no route")))
                .verifyComplete();

        assertEquals(HttpStatus.NOT_FOUND, exchange.getResponse().getStatusCode());
        String body = exchange.getResponse().getBodyAsString().block();
        assertTrue(body.contains("\"code\":2003"), body);
    }

    @Test
    void responseStatus404ReturnsResourceNotFound() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/unknown-path"));

        StepVerifier.create(handler.handle(exchange, new ResponseStatusException(HttpStatus.NOT_FOUND)))
                .verifyComplete();

        assertEquals(HttpStatus.NOT_FOUND, exchange.getResponse().getStatusCode());
        String body = exchange.getResponse().getBodyAsString().block();
        assertTrue(body.contains("\"code\":2003"), body);
    }

    @Test
    void committedResponseRethrows() {
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/home"));
        exchange.getResponse().setStatusCode(HttpStatus.OK);
        exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory()
                .wrap("partial".getBytes(StandardCharsets.UTF_8)))).block();

        IllegalStateException error = new IllegalStateException("late failure");
        assertThrows(IllegalStateException.class, () ->
                handler.handle(exchange, error).block());
    }
}
