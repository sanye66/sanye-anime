package com.sanye.sanye_anime;

final class SystemPlaybackPolicy {
    private boolean foreground = true;
    private boolean interrupted;

    boolean canPlay(boolean explicitPlay) {
        if (!foreground) return false;
        if (explicitPlay) interrupted = false;
        return !interrupted;
    }

    void interrupt() { interrupted = true; }

    void setForeground(boolean value) {
        foreground = value;
        if (!value) interrupt();
    }

    static long milliseconds(double seconds) {
        return Double.isFinite(seconds) && seconds > 0
            ? (long) Math.min(seconds * 1000, Long.MAX_VALUE) : 0;
    }
}
