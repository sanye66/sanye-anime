package com.sanye.anime.sanye_core.web;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ApiResponseTest {

    @Test
    void ok() {
        ApiResponse<List<String>> response = ApiResponse.ok(List.of("a"), "rid-1");
        assertEquals(0, response.code());
        assertEquals("ok", response.message());
        assertEquals("rid-1", response.requestId());
        assertEquals(List.of("a"), response.data());
    }

    @Test
    void error() {
        ApiResponse<Void> response = ApiResponse.error(3001, "业务状态不允许", "rid-2");
        assertEquals(3001, response.code());
        assertNull(response.data());
    }
}
