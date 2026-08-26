package com.sanye.anime.sanye_core.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InternalCallerTokenTest {

    @Test
    void matchesOnlyConfiguredNonBlankToken() {
        assertTrue(InternalCallerToken.matches("shared-token", "shared-token"));
        assertFalse(InternalCallerToken.matches("shared-token", "wrong-token"));
        assertFalse(InternalCallerToken.matches("", ""));
        assertFalse(InternalCallerToken.matches("shared-token", null));
    }
}
