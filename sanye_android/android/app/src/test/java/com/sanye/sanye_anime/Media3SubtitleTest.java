package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import org.junit.Test;

public class Media3SubtitleTest {
    @Test public void convertsSrtAndAppliesRealOffset() throws Exception {
        String result = Media3Subtitle.webVtt("1\r\n00:00:01,000 --> 00:00:03,000\r\n字幕\r\n", 500);
        assertTrue(result.startsWith("WEBVTT\n\n"));
        assertTrue(result.contains("00:00:01.500 --> 00:00:03.500"));
        assertFalse(result.contains("\n1\n"));
        assertTrue(result.contains("字幕"));
    }

    @Test public void preservesVttSettingsAndClampsNegativeTimes() throws Exception {
        String result = Media3Subtitle.webVtt("WEBVTT\n\n00:01.000 --> 00:03.000 align:start\n测试", -2000);
        assertTrue(result.contains("00:00:00.000 --> 00:00:01.000 align:start"));
        assertEquals(1, result.split("WEBVTT", -1).length - 1);
    }

    @Test public void rejectsMissingOrInvalidTiming() {
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("不是字幕", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("00:99:01,000 --> 00:99:02,000\n字幕", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("00:00:03,000 --> 00:00:01,000\n字幕", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("00:00:01,000 --> 00:00:03,000\n正常\n\n99:01:00,000 --> 99:02:00,000\n超限", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("00:00:01,000 --> 00:00:03,000\n正常\n\n00:00:XX,000 --> 00:00:04,000\n损坏", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("00:00:01,000 --> 00:00:03,000\n字幕", Long.MIN_VALUE));
    }

    @Test public void enforcesCueCountAndTwentyFourHourBoundary() throws Exception {
        String cue = "00:00:01,000 --> 00:00:03,000\n字幕\n\n";
        assertTrue(Media3Subtitle.webVtt(cue.repeat(10000), 0).startsWith("WEBVTT"));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt(cue.repeat(10001), 0));
        assertTrue(Media3Subtitle.webVtt("23:59:59,000 --> 24:00:00,000\n结尾", 0).contains("24:00:00.000"));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("23:59:59,000 --> 24:00:00,001\n超限", 0));
        assertThrows(java.io.IOException.class, () -> Media3Subtitle.webVtt("23:59:59,000 --> 24:00:00,000\n超限", 1));
    }
}
