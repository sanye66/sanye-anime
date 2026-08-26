package com.sanye.anime.sanye_core.exception;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ErrorCodeTest {

    @Test
    void codesAreUniqueAndMatchContract() {
        Set<Integer> codes = new HashSet<>();
        for (ErrorCode code : ErrorCode.values()) {
            assertTrue(codes.add(code.code()), "错误码重复: " + code.code());
        }
        assertEquals(0, ErrorCode.OK.code());
        assertEquals(2001, ErrorCode.UNAUTHORIZED.code());
        assertEquals(3002, ErrorCode.QUOTA_EXHAUSTED.code());
        assertEquals(5001, ErrorCode.INTERNAL_ERROR.code());
    }

    @Test
    void messagesAreNotEmpty() {
        assertTrue(Arrays.stream(ErrorCode.values()).allMatch(code -> code.message() != null && !code.message().isBlank()));
    }

    @Test
    void businessExceptionCarriesCode() {
        BusinessException ex = new BusinessException(ErrorCode.NOT_FOUND);
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode());
        assertEquals(ErrorCode.NOT_FOUND.message(), ex.getMessage());
    }
}
