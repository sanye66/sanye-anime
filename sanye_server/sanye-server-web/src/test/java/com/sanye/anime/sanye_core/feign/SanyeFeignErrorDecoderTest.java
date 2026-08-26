package com.sanye.anime.sanye_core.feign;

import feign.Request;
import feign.Response;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SanyeFeignErrorDecoderTest {

    private final SanyeFeignErrorDecoder decoder = new SanyeFeignErrorDecoder();

    private Response response(int status) {
        Request request = Request.create(
                Request.HttpMethod.GET,
                "http://localhost/upstream",
                Collections.emptyMap(),
                new byte[0],
                StandardCharsets.UTF_8,
                null);
        return Response.builder()
                .status(status)
                .reason("upstream")
                .request(request)
                .headers(Collections.emptyMap())
                .body("", StandardCharsets.UTF_8)
                .build();
    }

    @Test
    void mapsStatusToBusinessCode() {
        assertRemoteCode(401, 2001);
        assertRemoteCode(403, 2002);
        assertRemoteCode(404, 2003);
        assertRemoteCode(429, 1002);
        assertRemoteCode(503, 5001);
    }

    private void assertRemoteCode(int status, int expectedCode) {
        Exception ex = decoder.decode("get", response(status));
        assertTrue(ex instanceof RemoteServiceException);
        assertEquals(status, ((RemoteServiceException) ex).status());
        assertEquals(expectedCode, ((RemoteServiceException) ex).code());
    }
}
