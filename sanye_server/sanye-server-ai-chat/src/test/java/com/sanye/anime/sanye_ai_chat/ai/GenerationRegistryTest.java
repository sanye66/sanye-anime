package com.sanye.anime.sanye_ai_chat.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GenerationRegistryTest {

    private final GenerationRegistry registry = new GenerationRegistry();

    @Test
    void stopFlagLifecycle() {
        registry.register(1L);
        assertFalse(registry.isStopped(1L));
        registry.requestStop(1L);
        assertTrue(registry.isStopped(1L));
        registry.clear(1L);
        assertFalse(registry.isStopped(1L));
    }

    @Test
    void unknownMessageIsNotStopped() {
        assertFalse(registry.isStopped(99L));
        registry.requestStop(99L);
        assertFalse(registry.isStopped(99L));
    }
}
