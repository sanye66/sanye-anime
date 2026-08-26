package com.sanye.anime.sanye_core.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SensitiveMaskUtilTest {

    @Test
    void maskPhone() {
        assertEquals("138****5678", SensitiveMaskUtil.maskPhone("13812345678"));
        assertEquals("123", SensitiveMaskUtil.maskPhone("123"));
    }

    @Test
    void maskEmail() {
        assertEquals("s****@example.com", SensitiveMaskUtil.maskEmail("someone@example.com"));
        assertEquals("*@example.com", SensitiveMaskUtil.maskEmail("a@example.com"));
    }

    @Test
    void maskToken() {
        assertEquals("abcd****", SensitiveMaskUtil.maskToken("abcdefghij"));
    }

    @Test
    void maskHandlesNullOrShortInput() {
        assertNull(SensitiveMaskUtil.maskPhone(null));
        assertEquals("123456", SensitiveMaskUtil.maskPhone("123456"));
        assertNull(SensitiveMaskUtil.maskEmail(null));
        assertEquals("no-at-sign", SensitiveMaskUtil.maskEmail("no-at-sign"));
        assertNull(SensitiveMaskUtil.maskToken(null));
        assertEquals("short", SensitiveMaskUtil.maskToken("short"));
    }
}
