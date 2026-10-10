package com.sanye.sanye_anime;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SanyeCatalogPluginTest {
    @Test
    public void acceptsOnlyPublicHttpsAddresses() {
        assertTrue(SanyeCatalogPlugin.validUrl("https://example.org/episode.mp4"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://example.org/episode.mp4?token=example"));
        assertFalse(SanyeCatalogPlugin.validUrl("http://example.org/episode.mp4"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://user:password@example.org/video"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://localhost/video"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://192.168.1.20/video"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://172.20.1.2/video"));
        assertFalse(SanyeCatalogPlugin.validUrl("https://example.org/video#fragment"));
    }

    @Test
    public void recordUrlAcceptsSourcePageAddresses() {
        // 观看历史与保存的作品用的是「来源播放页地址」，天生带查询参数（?from=search）或片段；
        // 以前复用直链媒体校验，只要带一个参数就整条拒绝，用户看到「播放进度保存失败」。
        assertTrue(SanyeCatalogPlugin.validRecordUrl("https://www.yhdmtv.cc/p/123?from=search"));
        assertTrue(SanyeCatalogPlugin.validRecordUrl("https://www.yhdmtv.cc/p/123?from=search#episode-2"));
        assertTrue(SanyeCatalogPlugin.validRecordUrl("https://cdn.example.org/episode.mp4"));
        assertTrue(SanyeCatalogPlugin.validRecordUrl("https://www.yhdmtv.cc/p/123/"));
        // 底线不变：非 https、凭证、内网地址、控制字符与超长地址都不入库。
        assertFalse(SanyeCatalogPlugin.validRecordUrl("http://www.yhdmtv.cc/p/123"));
        assertFalse(SanyeCatalogPlugin.validRecordUrl("https://user:pass@www.yhdmtv.cc/p/123"));
        assertFalse(SanyeCatalogPlugin.validRecordUrl("https://127.0.0.1/p/123"));
        assertFalse(SanyeCatalogPlugin.validRecordUrl("https://router.local/p/123"));
        assertFalse(SanyeCatalogPlugin.validRecordUrl("https://www.yhdmtv.cc/p/12\u00073"));
        assertFalse(SanyeCatalogPlugin.validRecordUrl("https://www.yhdmtv.cc/" + "a".repeat(2100)));
    }

    @Test
    public void coverUrlKeepsRemoteHttpsAndBundledAssets() {
        // 随包封面是相对资源：此前整类被拒，随包作品的观看历史因此没有封面。
        assertTrue(SanyeCatalogPlugin.validCoverUrl("/assets/127-3f2a.jpg"));
        assertTrue(SanyeCatalogPlugin.validCoverUrl(""));
        assertTrue(SanyeCatalogPlugin.validCoverUrl("https://www.yhdmtv.cc/pic/cover.jpg"));
        assertTrue(SanyeCatalogPlugin.validCoverUrl("https://img.picbf.com/upload/cover.jpg"));
        // 来源封面域名无法预先穷举：公网 https 图床一律允许（带签名参数也算）。
        assertTrue(SanyeCatalogPlugin.validCoverUrl("https://other.example/track.png?sign=abc"));
        // 底线：凭证、片段、非标准端口、内网域名与相对路径穿越都不入库。
        assertFalse(SanyeCatalogPlugin.validCoverUrl("/assets/../secret.jpg"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("https://user:pass@img.picbf.com/cover.jpg"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("https://img.picbf.com/cover.jpg#frag"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("https://img.picbf.com:8080/cover.jpg"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("https://127.0.0.1/cover.jpg"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("https://router.local/cover.jpg"));
        assertFalse(SanyeCatalogPlugin.validCoverUrl("http://www.yhdmtv.cc/pic/cover.jpg"));
    }

    @Test
    public void progressRequiresFiniteBoundedPositions() {
        assertTrue(SanyeCatalogPlugin.validProgress(0.0, 0.0));
        assertTrue(SanyeCatalogPlugin.validProgress(42.5, 120.0));
        assertFalse(SanyeCatalogPlugin.validProgress(null, 120.0));
        assertFalse(SanyeCatalogPlugin.validProgress(-1.0, 120.0));
        assertFalse(SanyeCatalogPlugin.validProgress(121.0, 120.0));
        assertFalse(SanyeCatalogPlugin.validProgress(Double.NaN, 120.0));
        assertFalse(SanyeCatalogPlugin.validProgress(1.0, Double.POSITIVE_INFINITY));
        assertFalse(SanyeCatalogPlugin.validProgress(8640001.0, 8640001.0));
    }

    @Test
    public void settingsRejectSecretsAndUnboundedValues() {
        assertTrue(SanyeCatalogPlugin.validSetting("theme", "dark"));
        assertTrue(SanyeCatalogPlugin.validSetting("autoPlay", false));
        assertTrue(SanyeCatalogPlugin.validSetting("playbackRate", 1.25));
        assertTrue(SanyeCatalogPlugin.validSetting("qualityProfile", "balanced"));
        assertTrue(SanyeCatalogPlugin.validSetting("frameTarget", "auto"));
        assertTrue(SanyeCatalogPlugin.validSetting("frameTarget", "90"));
        assertTrue(SanyeCatalogPlugin.validSetting("frameTarget", "120"));
        assertFalse(SanyeCatalogPlugin.validSetting("apiKey", "secret"));
        assertFalse(SanyeCatalogPlugin.validSetting("theme", "unknown"));
        assertFalse(SanyeCatalogPlugin.validSetting("autoPlay", "true"));
        assertFalse(SanyeCatalogPlugin.validSetting("playbackRate", Double.NaN));
        assertFalse(SanyeCatalogPlugin.validSetting("playbackRate", 2.5));
        assertFalse(SanyeCatalogPlugin.validSetting("qualityProfile", "upscale"));
        assertTrue(SanyeCatalogPlugin.validSetting("qualityProfile", "sharp"));
        assertFalse(SanyeCatalogPlugin.validSetting("qualityProfile", "restore"));
        assertFalse(SanyeCatalogPlugin.validSetting("qualityProfile", true));
        // 帧率档：老客户端会把档位当数字发过来，两种写法都要收下，否则整条设置保存失败。
        assertTrue(SanyeCatalogPlugin.validSetting("frameTarget", 120));
        assertTrue(SanyeCatalogPlugin.validSetting("frameTarget", 60));
        assertFalse(SanyeCatalogPlugin.validSetting("frameTarget", 61));
        assertFalse(SanyeCatalogPlugin.validSetting("frameTarget", "240fps"));
        assertFalse(SanyeCatalogPlugin.validSetting("frameTarget", "off "));
        // 音量（VQ-61）：与 PC 端一样随设置落盘，只收 0~1 的有限数。
        assertTrue(SanyeCatalogPlugin.validSetting("volume", 1.0));
        assertTrue(SanyeCatalogPlugin.validSetting("volume", 0.0));
        assertTrue(SanyeCatalogPlugin.validSetting("volume", 0.35));
        assertFalse(SanyeCatalogPlugin.validSetting("volume", 1.5));
        assertFalse(SanyeCatalogPlugin.validSetting("volume", -0.1));
        assertFalse(SanyeCatalogPlugin.validSetting("volume", Double.NaN));
        assertFalse(SanyeCatalogPlugin.validSetting("volume", "0.5"));
    }

    @Test
    public void historyKeysRejectEmptyAndControlCharacters() {
        assertTrue(SanyeCatalogPlugin.validLabel("第 1 集", 120));
        assertFalse(SanyeCatalogPlugin.validLabel("", 120));
        assertFalse(SanyeCatalogPlugin.validLabel("a\nb", 120));
        assertFalse(SanyeCatalogPlugin.validLabel("x".repeat(257), 256));
        // 选集/线路 id 与条目标题可以缺省：来源没有这些字段时历史仍然要能保存。
        assertTrue(SanyeCatalogPlugin.validOptionalLabel("", 256));
        assertTrue(SanyeCatalogPlugin.validOptionalLabel("HD中字", 256));
        assertFalse(SanyeCatalogPlugin.validOptionalLabel("a\nb", 120));
        assertFalse(SanyeCatalogPlugin.validOptionalLabel("x".repeat(257), 256));
    }

    @Test
    public void historyItemMirrorsTheStoredColumnsWithoutReadingBack() {
        // 保存进度不再回读同一条记录（VQ-56），返回项由写入值直接组装；
        // 这里锁定字段名与类型，避免桥接契约在没人察觉的情况下漂移。
        java.util.Map<String, Object> values = SanyeCatalogPlugin.historyValues("https://www.yhdmtv.cc/p/123", "作品",
            "第1集", "第1集 · 正片", "加速云", "https://img.picbf.com/cover.jpg", 42.5, 120.0, true, 1_700_000_000_000L);
        org.junit.Assert.assertEquals(java.util.List.of("mediaUrl", "title", "episodeId", "episodeTitle", "lineId",
            "coverUrl", "positionSeconds", "durationSeconds", "completed", "updatedAt"), new java.util.ArrayList<>(values.keySet()));
        org.junit.Assert.assertEquals("https://www.yhdmtv.cc/p/123", values.get("mediaUrl"));
        org.junit.Assert.assertEquals("作品", values.get("title"));
        org.junit.Assert.assertEquals("第1集", values.get("episodeId"));
        org.junit.Assert.assertEquals("第1集 · 正片", values.get("episodeTitle"));
        org.junit.Assert.assertEquals("加速云", values.get("lineId"));
        org.junit.Assert.assertEquals("https://img.picbf.com/cover.jpg", values.get("coverUrl"));
        org.junit.Assert.assertEquals(42.5, (Double) values.get("positionSeconds"), 0.0001);
        org.junit.Assert.assertEquals(120.0, (Double) values.get("durationSeconds"), 0.0001);
        org.junit.Assert.assertEquals(Boolean.TRUE, values.get("completed"));
        org.junit.Assert.assertEquals(1_700_000_000_000L, values.get("updatedAt"));
    }
}
