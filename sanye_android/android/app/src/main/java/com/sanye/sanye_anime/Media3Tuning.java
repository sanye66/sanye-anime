package com.sanye.sanye_anime;

final class Media3Tuning {
    static final int MIN_BUFFER_MS = 15_000;
    static final int MAX_BUFFER_MS = 35_000;
    static final int START_BUFFER_MS = 800;
    static final int REBUFFER_MS = 2_000;
    static final int TARGET_BUFFER_BYTES = 64 * 1024 * 1024;
    static final int MAX_VIDEO_WIDTH = 1920;
    static final int MAX_VIDEO_HEIGHT = 1080;
    static final int HANDOFF_TIMEOUT_MS = 15_000;
    static final int AUTO_NEXT_SECONDS = 5;

    static boolean autoNext(boolean hasNext, boolean enabled, boolean foreground,
            boolean pictureInPicture, boolean paused, boolean switching) {
        return hasNext && enabled && foreground && !pictureInPicture && !paused && !switching;
    }
}
