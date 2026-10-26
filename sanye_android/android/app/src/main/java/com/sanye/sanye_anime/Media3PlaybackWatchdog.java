package com.sanye.sanye_anime;

final class Media3PlaybackWatchdog {
    enum Failure { NONE, FIRST_FRAME_TIMEOUT, STALLED }
    static final long STALL_TIMEOUT_MILLIS = 12000;
    private final long firstFrameBudget;
    private long previousAt;
    private long previousFramePosition;
    private long firstFrameWait;
    private long stalledMillis;
    private long bufferedMillis;
    private boolean previousActive;
    private boolean rendered;
    private boolean previousBuffering;

    Media3PlaybackWatchdog(long now, long firstFrameBudget) {
        this.firstFrameBudget = Media3PlaybackPolicy.firstFrameBudget(firstFrameBudget);
        previousAt = now;
    }

    Failure observe(long now, long framePosition, boolean foreground, boolean playRequested, boolean buffering, boolean firstFrame, boolean seeking) {
        long elapsed = Math.max(0, now - previousAt);
        boolean active = foreground && playRequested && !seeking;
        boolean wasRendered = rendered;
        if (previousActive && !rendered) firstFrameWait += elapsed;
        if (firstFrame) rendered = true;
        if (!active || !previousActive || !wasRendered || framePosition > previousFramePosition) stalledMillis = 0;
        else stalledMillis += elapsed;
        bufferedMillis = active && previousActive && wasRendered && buffering && previousBuffering ? bufferedMillis + elapsed : 0;
        previousAt = now;
        previousFramePosition = framePosition;
        previousActive = active;
        previousBuffering = buffering;
        if (!active) return Failure.NONE;
        if (!rendered && firstFrameWait >= firstFrameBudget) return Failure.FIRST_FRAME_TIMEOUT;
        return rendered && Math.max(stalledMillis, bufferedMillis) >= STALL_TIMEOUT_MILLIS ? Failure.STALLED : Failure.NONE;
    }

    void discontinuity(long now, long framePosition) {
        previousAt = now;
        previousFramePosition = framePosition;
        previousActive = false;
        stalledMillis = 0;
        bufferedMillis = 0;
        previousBuffering = false;
    }
}
