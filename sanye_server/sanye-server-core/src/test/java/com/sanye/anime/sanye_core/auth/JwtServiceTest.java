package com.sanye.anime.sanye_core.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    private final JwtService jwtService = new JwtService("test-secret", 1800);

    @Test
    void issueAndVerifyRoundTrip() {
        String token = jwtService.issue(42, "sanye-user");
        JwtService.Claims claims = jwtService.verify(token).orElseThrow();
        assertEquals(42, claims.userId());
        assertEquals("sanye-user", claims.username());
    }

    @Test
    void rejectsTamperedToken() {
        String token = jwtService.issue(1, "u");
        String tampered = token.substring(0, token.length() - 2) + "xx";
        assertTrue(jwtService.verify(tampered).isEmpty());
        assertTrue(jwtService.verify("not-a-token").isEmpty());
        assertTrue(jwtService.verify(null).isEmpty());
    }
}
