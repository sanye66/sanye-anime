package com.sanye.sanye_anime;

import org.junit.Test;
import static org.junit.Assert.*;

public class SystemPlaybackPolicyTest {
    @Test public void interruptionNeverAutomaticallyResumes() {
        SystemPlaybackPolicy policy = new SystemPlaybackPolicy();
        assertTrue(policy.canPlay(true));
        policy.interrupt();
        assertFalse(policy.canPlay(false));
        assertTrue(policy.canPlay(true));
    }

    @Test public void backgroundDeniesEvenExplicitPlayUntilForeground() {
        SystemPlaybackPolicy policy = new SystemPlaybackPolicy();
        policy.setForeground(false);
        assertFalse(policy.canPlay(true));
        policy.setForeground(true);
        assertFalse(policy.canPlay(false));
        assertTrue(policy.canPlay(true));
    }

    @Test public void sanitizesInvalidAndInfiniteTimes() {
        assertEquals(1250, SystemPlaybackPolicy.milliseconds(1.25));
        assertEquals(0, SystemPlaybackPolicy.milliseconds(-1));
        assertEquals(0, SystemPlaybackPolicy.milliseconds(Double.NaN));
        assertEquals(0, SystemPlaybackPolicy.milliseconds(Double.POSITIVE_INFINITY));
        assertEquals(Long.MAX_VALUE, SystemPlaybackPolicy.milliseconds(Double.MAX_VALUE));
    }
}
