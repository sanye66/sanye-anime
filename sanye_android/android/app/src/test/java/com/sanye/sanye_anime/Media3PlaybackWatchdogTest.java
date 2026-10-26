package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import static com.sanye.sanye_anime.Media3PlaybackWatchdog.Failure.*;
import org.junit.Test;

public class Media3PlaybackWatchdogTest {
    @Test public void enforcesBothSettledFirstFrameBudgets() {
        for (long budget : new long[]{20000, 30000}) {
            Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, budget);
            assertEquals(NONE, guard.observe(0, 0, true, true, true, false, false));
            assertEquals(NONE, guard.observe(budget - 1, 0, true, true, true, false, false));
            assertEquals(FIRST_FRAME_TIMEOUT, guard.observe(budget, 0, true, true, true, false, false));
        }
    }

    @Test public void pausesFirstFrameBudgetAndResumesRemainingActiveTime() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
        guard.observe(0, 0, true, true, true, false, false);
        assertEquals(NONE, guard.observe(10000, 0, true, false, true, false, false));
        assertEquals(NONE, guard.observe(100000, 0, true, false, true, false, false));
        assertEquals(NONE, guard.observe(100000, 0, true, true, true, false, false));
        assertEquals(NONE, guard.observe(109999, 0, true, true, true, false, false));
        assertEquals(FIRST_FRAME_TIMEOUT, guard.observe(110000, 0, true, true, true, false, false));
    }

    @Test public void backgroundTimeIsExcludedFromInitialBudget() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
        guard.observe(0, 0, true, true, true, false, false);
        guard.observe(5000, 0, false, true, true, false, false);
        assertEquals(NONE, guard.observe(105000, 0, true, true, true, false, false));
        assertEquals(NONE, guard.observe(119999, 0, true, true, true, false, false));
        assertEquals(FIRST_FRAME_TIMEOUT, guard.observe(120000, 0, true, true, true, false, false));
    }

    @Test public void firstFrameStartsFreshStallBudgetRatherThanCountingWarmup() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 30000);
        guard.observe(0, 0, true, true, true, false, false);
        assertEquals(NONE, guard.observe(28000, 0, true, true, false, true, false));
        assertEquals(NONE, guard.observe(39999, 0, true, true, false, true, false));
        assertEquals(STALLED, guard.observe(40000, 0, true, true, false, true, false));
    }

    @Test public void movingFramesResetStallButContinuousBufferingStillHasBudget() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
        guard.observe(0, 0, true, true, false, true, false);
        assertEquals(NONE, guard.observe(11000, 1, true, true, false, true, false));
        assertEquals(NONE, guard.observe(22000, 2, true, true, true, true, false));
        assertEquals(NONE, guard.observe(33999, 3, true, true, true, true, false));
        assertEquals(STALLED, guard.observe(34000, 4, true, true, true, true, false));
    }

    @Test public void pauseAndBackgroundBreakContinuousStall() {
        for (boolean pause : new boolean[]{true, false}) {
            Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
            guard.observe(0, 0, true, true, false, true, false);
            guard.observe(11000, 0, true, true, false, true, false);
            assertEquals(NONE, guard.observe(11001, 0, pause, !pause, true, true, false));
            assertEquals(NONE, guard.observe(100000, 0, true, true, true, true, false));
            assertEquals(NONE, guard.observe(111999, 0, true, true, true, true, false));
            assertEquals(STALLED, guard.observe(112000, 0, true, true, true, true, false));
        }
    }

    @Test public void seekInteractionIsExcludedAndRestartsContinuousStall() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
        guard.observe(0, 1000, true, true, false, true, false);
        guard.observe(11000, 1000, true, true, false, true, false);
        assertEquals(NONE, guard.observe(11000, 1000, true, true, true, true, true));
        assertEquals(NONE, guard.observe(100000, 1000, true, true, true, true, true));
        guard.discontinuity(100000, 500);
        assertEquals(NONE, guard.observe(100000, 500, true, true, true, true, false));
        assertEquals(NONE, guard.observe(111999, 500, true, true, true, true, false));
        assertEquals(STALLED, guard.observe(112000, 500, true, true, true, true, false));
    }

    @Test public void seekDoesNotConsumeFirstFrameWaitAndNewSessionResetsBudget() {
        Media3PlaybackWatchdog guard = new Media3PlaybackWatchdog(0, 20000);
        guard.observe(0, 0, true, true, true, false, false);
        guard.observe(8000, 0, true, true, true, false, true);
        guard.observe(100000, 0, true, true, true, false, true);
        guard.discontinuity(100000, 1000);
        guard.observe(100000, 1000, true, true, true, false, false);
        assertEquals(NONE, guard.observe(111999, 1000, true, true, true, false, false));
        assertEquals(FIRST_FRAME_TIMEOUT, guard.observe(112000, 1000, true, true, true, false, false));
        Media3PlaybackWatchdog next = new Media3PlaybackWatchdog(112000, 20000);
        next.observe(112000, 0, true, true, true, false, false);
        assertEquals(NONE, next.observe(131999, 0, true, true, true, false, false));
    }
}
