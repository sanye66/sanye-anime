package com.sanye.sanye_anime;

final class Media3VideoMetrics {
    int width = -1;
    int height = -1;
    float fps = -1;
    int bitrate = -1;
    long droppedFrames;
    String decoder = "";
    private long seekStarted = -1;
    volatile long seekLatencyMs = -1;

    void format(int newWidth, int newHeight, float newFps, int newBitrate) {
        width = newWidth;
        height = newHeight;
        fps = Float.isFinite(newFps) && newFps > 0 ? newFps : -1;
        bitrate = newBitrate;
    }

    void dropped(int count) { droppedFrames += Math.max(0, count); }
    synchronized void seeking(long now) { seekStarted = now; seekLatencyMs = -1; }
    synchronized void rendered(long now) {
        if (seekStarted >= 0) {
            seekLatencyMs = Math.max(0, now - seekStarted);
            seekStarted = -1;
        }
    }
}
