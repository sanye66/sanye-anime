package com.sanye.anime.sanye_core.auth;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthContextTest {

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void defaultContextIsAnonymous() {
        AuthContext.Context context = AuthContext.get();
        assertTrue(context.anonymous());
        assertEquals(null, context.userId());
    }

    @Test
    void setAndGetRoundTrip() {
        AuthContext.set(new AuthContext.Context(42L, "device-1", false));
        AuthContext.Context context = AuthContext.get();
        assertEquals(42L, context.userId());
        assertEquals("device-1", context.deviceId());
        assertEquals(false, context.anonymous());
    }

    @Test
    void requireUserIdThrowsWhenAnonymous() {
        AuthContext.set(new AuthContext.Context(null, "device-1", true));
        BusinessException ex = assertThrows(BusinessException.class, AuthContext::requireUserId);
        assertEquals(ErrorCode.UNAUTHORIZED, ex.errorCode());
    }

    @Test
    void requireUserIdReturnsWhenLoggedIn() {
        AuthContext.set(new AuthContext.Context(7L, "device-1", false));
        assertEquals(7L, AuthContext.requireUserId());
    }

    @Test
    void clearResetsToAnonymous() {
        AuthContext.set(new AuthContext.Context(1L, "device-1", false));
        AuthContext.clear();
        assertTrue(AuthContext.get().anonymous());
    }
}
