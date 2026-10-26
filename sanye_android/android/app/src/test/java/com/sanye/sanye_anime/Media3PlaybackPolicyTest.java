package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import java.io.File;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class Media3PlaybackPolicyTest {
    @Test public void acceptsOnlyBoundedNoncredentialPlaybackHeaders() throws Exception {
        var values = java.util.Map.of("Referer", "https://source.example.com/play/1", "User-Agent", "Mozilla/5.0");
        assertEquals(values, Media3PlaybackPolicy.requestHeaders(values));
        for (String name : new String[]{"Authorization", "Cookie", "Host", "Proxy-Authorization", "X-Token"}) {
            assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.requestHeaders(java.util.Map.of(name, "secret")));
        }
        for (String value : new String[]{"https://localhost/play", "http://source.example.com/play", "https://name:password@source.example.com/play", "https://127.0.0.1/play", "https://source.example.com/\r\nCookie: x"}) {
            assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.requestHeaders(java.util.Map.of("Referer", value)));
        }
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.requestHeaders(java.util.Map.of("User-Agent", "a".repeat(513))));
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.requestHeaders(java.util.Map.of("User-Agent", "UA\nCookie: x")));
    }
    @Test public void retriesCdnConnectionsWithSafeRedirectAndProxyPolicy() {
        okhttp3.OkHttpClient client = Media3SafeDataSource.networkClient();
        assertTrue(client.retryOnConnectionFailure());
        assertFalse(client.followRedirects());
        assertFalse(client.followSslRedirects());
        assertEquals(java.net.Proxy.NO_PROXY, client.proxy());
        for (String host : new String[]{"127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"}) {
            assertThrows(java.net.UnknownHostException.class, () -> client.dns().lookup(host));
        }
    }

    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void rejectsUnsafeSchemesCredentialsAndPorts() throws Exception {
        for (String value : new String[]{"http://example.com/video.mp4", "https://user:pass@example.com/video.mp4",
                "https://example.com:8443/video.mp4", "content://downloads/1", "https://localhost/video.mp4", "https://host.local/video.mp4",
                "https://127.0.0.1/video.mp4", "https://10.0.0.1/video.mp4", "https://[::1]/video.mp4", "https://169.254.169.254/latest/meta-data"}) {
            assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.networkUri(value));
        }
        assertEquals("example.com", Media3PlaybackPolicy.networkUri("https://example.com/segment.ts").getHost());
    }

    @Test public void acceptsOnlyIndexedCompletedDownload() throws Exception {
        DownloadStore store = new DownloadStore(temporary.newFolder("downloads"));
        DownloadStore.Item item = store.add("https://example.com/video.mp4", "测试视频");
        item = store.next();
        byte[] bytes = new byte[32];
        bytes[3] = 16; bytes[4] = 'f'; bytes[5] = 't'; bytes[6] = 'y'; bytes[7] = 'p';
        Files.write(store.file(item, true).toPath(), bytes);
        store.progress(item, bytes.length, bytes.length, true);
        String unfinished = store.file(item, true).toURI().toString();
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.completedFile(unfinished, store));
        store.complete(item);
        File completed = store.playable(item.id);
        assertEquals(completed, Media3PlaybackPolicy.completedFile(completed.toURI().toString(), store));
        File outside = temporary.newFile("outside.mp4");
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.completedFile(outside.toURI().toString(), store));
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.completedFile("file://host/video.mp4", store));
        Files.write(completed.toPath(), new byte[16]);
        assertThrows(java.io.IOException.class, () -> Media3PlaybackPolicy.completedFile(completed.toURI().toString(), store));
    }

    @Test public void clampsNonfiniteAndOutOfRangeNumbers() {
        assertEquals(1, Media3PlaybackPolicy.finite(Double.NaN, 0.25, 3, 1), 0);
        assertEquals(1, Media3PlaybackPolicy.finite(Double.POSITIVE_INFINITY, 0.25, 3, 1), 0);
        assertEquals(3, Media3PlaybackPolicy.finite(10, 0.25, 3, 1), 0);
        assertEquals(0.25, Media3PlaybackPolicy.finite(-1, 0.25, 3, 1), 0);
    }

    @Test public void acceptsOnlySettledSpeedWhitelist() {
        for (float value : new float[]{0.75f, 1, 1.25f, 1.5f, 2}) assertEquals(value, Media3PlaybackPolicy.rate(value), 0);
        for (double invalid : new double[]{0.5, 3, 0, Double.NaN, Double.POSITIVE_INFINITY}) assertEquals(1, Media3PlaybackPolicy.rate(invalid), 0);
    }

    @Test public void acceptsOnlyTwentyOrThirtySecondBudgets() {
        assertEquals(20000, Media3PlaybackPolicy.firstFrameBudget(20000));
        assertEquals(30000, Media3PlaybackPolicy.firstFrameBudget(30000));
        for (double value : new double[]{0, 20, 12000, 19999, 20000.5, 30001, Double.NaN, Double.POSITIVE_INFINITY}) {
            assertThrows(IllegalArgumentException.class, () -> Media3PlaybackPolicy.firstFrameBudget(value));
        }
    }

    @Test public void qualityLabelsContainOnlyRealResolutionOrBitrate() {
        assertEquals("1920 × 1080 · 2500 kbps", Media3PlaybackPolicy.videoTrackLabel(1920, 1080, 2500000));
        assertEquals("1280 × 720", Media3PlaybackPolicy.videoTrackLabel(1280, 720, -1));
        assertEquals("900 kbps", Media3PlaybackPolicy.videoTrackLabel(-1, -1, 900000));
        assertNull(Media3PlaybackPolicy.videoTrackLabel(-1, -1, -1));
    }
}
