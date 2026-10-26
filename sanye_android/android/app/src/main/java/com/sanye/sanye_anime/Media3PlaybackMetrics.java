package com.sanye.sanye_anime;

final class Media3PlaybackMetrics {
    private final long openedAt;
    private long previousAt;
    private long previousPosition;
    private boolean previousPlaying;
    private boolean previousStalling;
    private boolean rendered;
    private double previousRate = 1;
    private long firstFrameMillis = -1;
    private double watchedSeconds;
    private double stallSeconds;

    Media3PlaybackMetrics(long now) { openedAt = now; previousAt = now; }

    void sample(long now, long position, boolean playing, boolean buffering, boolean playRequested, double rate, boolean firstFrame) {
        double elapsed = Math.max(0, now - previousAt) / 1000.0;
        if (previousStalling) stallSeconds += elapsed;
        if (previousPlaying && rendered && position >= previousPosition) {
            double progressed = (position - previousPosition) / 1000.0 / previousRate;
            if (progressed <= elapsed + 0.5) watchedSeconds += Math.min(elapsed, progressed);
        }
        if (firstFrame && !rendered) { rendered = true; firstFrameMillis = Math.max(0, now - openedAt); }
        previousAt = now;
        previousPosition = Math.max(0, position);
        previousPlaying = playing;
        previousStalling = buffering && playRequested && rendered;
        previousRate = Media3PlaybackPolicy.finite(rate, 0.25, 3, 1);
    }

    void discontinuity(long now, long position) {
        previousAt = now;
        previousPosition = Math.max(0, position);
    }

    long firstFrameMillis() { return firstFrameMillis; }
    double watchedSeconds() { return watchedSeconds; }
    double stallSeconds() { return stallSeconds; }
}
