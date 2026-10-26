package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import org.junit.Test;

public class Media3PlaybackMetricsTest {
    @Test public void measuresFirstFrameAndOnlyRenderedPlayback() {
        Media3PlaybackMetrics stats = new Media3PlaybackMetrics(1000);
        stats.sample(1200, 0, false, true, true, 1, false);
        stats.sample(3000, 0, true, false, true, 1, true);
        assertEquals(2000, stats.firstFrameMillis());
        assertEquals(0, stats.watchedSeconds(), 0);
        assertEquals(0, stats.stallSeconds(), 0);
        stats.sample(4000, 1000, true, false, true, 1, true);
        assertEquals(1, stats.watchedSeconds(), 0.001);
        stats.sample(4500, 1500, false, false, false, 1, true);
        stats.sample(9000, 1500, false, false, false, 1, true);
        assertEquals(1.5, stats.watchedSeconds(), 0.001);
    }

    @Test public void separatesStallsFromPausedBufferingAndCountsDoubleSpeedWallTime() {
        Media3PlaybackMetrics stats = new Media3PlaybackMetrics(0);
        stats.sample(0, 0, true, false, true, 2, true);
        stats.sample(1000, 2000, false, true, true, 2, true);
        stats.sample(4000, 2000, false, true, false, 2, true);
        stats.sample(9000, 2000, false, true, false, 2, true);
        assertEquals(1, stats.watchedSeconds(), 0.001);
        assertEquals(3, stats.stallSeconds(), 0.001);
    }

    @Test public void excludesSeekJumpsAndUsesDiscontinuityBaseline() {
        Media3PlaybackMetrics stats = new Media3PlaybackMetrics(0);
        stats.sample(0, 0, true, false, true, 1, true);
        stats.sample(1000, 60000, true, false, true, 1, true);
        assertEquals(0, stats.watchedSeconds(), 0);
        stats.discontinuity(1500, 30000);
        stats.sample(2500, 31000, true, false, true, 1, true);
        assertEquals(1, stats.watchedSeconds(), 0.001);
    }

    @Test public void missingFrameAndNewSessionRemainUnmeasured() {
        Media3PlaybackMetrics stats = new Media3PlaybackMetrics(0);
        stats.sample(1000, 1000, true, false, true, 1, false);
        stats.sample(2000, 2000, true, false, true, 1, false);
        assertEquals(-1, stats.firstFrameMillis());
        assertEquals(0, stats.watchedSeconds(), 0);
        Media3PlaybackMetrics next = new Media3PlaybackMetrics(5000);
        assertEquals(0, next.stallSeconds(), 0);
        assertEquals(-1, next.firstFrameMillis());
    }
}
