package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import org.junit.Test;

public class Media3TuningTest {
    @Test public void buffersAreBoundedAndStartupIsShorterThanRecovery() {
        assertTrue(Media3Tuning.START_BUFFER_MS > 0);
        assertTrue(Media3Tuning.START_BUFFER_MS < Media3Tuning.REBUFFER_MS);
        assertTrue(Media3Tuning.REBUFFER_MS <= Media3Tuning.MIN_BUFFER_MS);
        assertTrue(Media3Tuning.MIN_BUFFER_MS <= Media3Tuning.MAX_BUFFER_MS);
        assertTrue(Media3Tuning.MAX_BUFFER_MS <= 50_000);
        assertEquals(1920, Media3Tuning.MAX_VIDEO_WIDTH);
        assertEquals(1080, Media3Tuning.MAX_VIDEO_HEIGHT);
    }

    @Test public void automaticContinuationRequiresAnActiveForegroundSession() {
        assertTrue(Media3Tuning.autoNext(true, true, true, false, false, false));
        assertFalse(Media3Tuning.autoNext(false, true, true, false, false, false));
        assertFalse(Media3Tuning.autoNext(true, false, true, false, false, false));
        assertFalse(Media3Tuning.autoNext(true, true, false, false, false, false));
        assertFalse(Media3Tuning.autoNext(true, true, true, true, false, false));
        assertFalse(Media3Tuning.autoNext(true, true, true, false, true, false));
        assertFalse(Media3Tuning.autoNext(true, true, true, false, false, true));
    }

    @Test public void observationsNeverInventUnknownVideoData() {
        Media3VideoMetrics metrics = new Media3VideoMetrics();
        assertEquals(-1, metrics.width);
        assertEquals(-1, metrics.seekLatencyMs);
        metrics.format(1920, 1080, Float.NaN, 2_000_000);
        assertEquals(-1, metrics.fps, 0);
        metrics.dropped(4);
        metrics.dropped(-1);
        assertEquals(4, metrics.droppedFrames);
        metrics.seeking(200);
        metrics.rendered(320);
        metrics.rendered(700);
        assertEquals(120, metrics.seekLatencyMs);
    }
}
