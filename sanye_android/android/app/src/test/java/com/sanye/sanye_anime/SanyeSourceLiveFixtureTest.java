package com.sanye.sanye_anime;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import org.junit.Assume;
import org.junit.Test;

/** Optional local acceptance against fresh public HTML; never runs network requests in CI. */
public class SanyeSourceLiveFixtureTest {
    @Test
    public void pcConfiguredPagesProvideSearchToEpisodePlaybackMetadata() throws Exception {
        String folder = System.getenv("SANYE_ANDROID_SOURCE_FIXTURE");
        Assume.assumeTrue("仅在提供本次来源 HTML 快照时运行", folder != null && !folder.isBlank());
        Path directory = Path.of(folder);
        String search = new String(Files.readAllBytes(directory.resolve("search.html")), StandardCharsets.UTF_8);
        String detail = new String(Files.readAllBytes(directory.resolve("detail.html")), StandardCharsets.UTF_8);
        String playback = new String(Files.readAllBytes(directory.resolve("playback.html")), StandardCharsets.UTF_8);
        var hits = SanyeSourcePlugin.parseSearch(search,
            "https://www.yhdmtv.cc/public/auto/search1.html?keyword=你的名字", "你的名字");
        assertFalse(hits.isEmpty());
        assertTrue(hits.stream().allMatch(hit -> SanyeSourcePlugin.allowedDetail(java.net.URI.create(hit.sourceUrl()))));
        assertTrue(hits.stream().anyMatch(hit -> hit.sourceUrl().matches("https://www\\.yhdmtv\\.cc/v/[^/]+/[^/]+/?")));
        assertTrue(hits.stream().anyMatch(hit -> !hit.coverUrl().isBlank() && SanyeSourcePlugin.allowedCover(java.net.URI.create(hit.coverUrl()))));
        var preview = SanyeSourcePlugin.parsePreview(detail, "https://yinghuadongman.org.cn/p/52685/");
        assertTrue(preview.coverUrl().startsWith("https://www.mdzywtupian.com/upload/vod/"));
        assertTrue(preview.episodes().size() >= 3);
        assertTrue(preview.episodes().stream().anyMatch(item -> item.sourceUrl().startsWith("https://yinghuadongman.org.cn/v/52685-")));
        var episode = SanyeSourcePlugin.parsePreview(playback, "https://yinghuadongman.org.cn/v/52685-2-1/");
        assertTrue(episode.episodes().stream().anyMatch(item -> item.playbackUrl().startsWith("https://")
            && (item.mimeType().equals("application/vnd.apple.mpegurl") || item.mimeType().equals("video/mp4"))));
    }
}
