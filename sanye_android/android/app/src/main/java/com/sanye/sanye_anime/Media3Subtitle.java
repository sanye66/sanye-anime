package com.sanye.sanye_anime;

import java.io.IOException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class Media3Subtitle {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int MAX_CUES = 10000;
    static final long MAX_TIME_MILLIS = 24 * 60 * 60 * 1000L;
    private static final Pattern TIMING = Pattern.compile("(?m)^(\\d{1,3}:\\d{2}:\\d{2}[,.]\\d{3}|\\d{2}:\\d{2}\\.\\d{3})\\s+-->\\s+(\\d{1,3}:\\d{2}:\\d{2}[,.]\\d{3}|\\d{2}:\\d{2}\\.\\d{3})([^\\r\\n]*)$");

    static String webVtt(String source, long offsetMillis) throws IOException {
        if (source.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES
                || offsetMillis < -600_000 || offsetMillis > 600_000) throw new IOException("字幕或偏移超出限制");
        String text = source.replace("\uFEFF", "").replace("\r\n", "\n").replace('\r', '\n');
        boolean isVtt = text.startsWith("WEBVTT");
        if (!isVtt) text = text.replaceAll("(?m)^\\d+\\n(?=\\d{1,3}:\\d{2}:\\d{2}[,.])", "");
        Matcher matcher = TIMING.matcher(text);
        StringBuffer shifted = new StringBuffer();
        int cues = 0;
        while (matcher.find()) {
            long start = millis(matcher.group(1));
            long end = millis(matcher.group(2));
            if (end <= start || end > MAX_TIME_MILLIS) throw new IOException("字幕时间范围无效或超过 24 小时");
            long shiftedStart = Math.max(0, start + offsetMillis);
            long shiftedEnd = Math.max(shiftedStart + 1, end + offsetMillis);
            if (shiftedEnd > MAX_TIME_MILLIS) throw new IOException("字幕偏移后超过 24 小时");
            matcher.appendReplacement(shifted, Matcher.quoteReplacement(stamp(shiftedStart) + " --> " + stamp(shiftedEnd) + matcher.group(3)));
            cues++;
            if (cues > MAX_CUES) throw new IOException("字幕不得超过 10000 条");
        }
        if (cues == 0) throw new IOException("请选择 UTF-8 编码的 SRT 或 VTT 字幕");
        matcher.appendTail(shifted);
        Matcher arrows = Pattern.compile("(?m)^.*-->.*$").matcher(text);
        int timingLines = 0;
        while (arrows.find()) timingLines++;
        if (timingLines != cues) throw new IOException("字幕包含损坏的时间行");
        return (isVtt ? "" : "WEBVTT\n\n") + shifted;
    }

    private static long millis(String value) throws IOException {
        String[] fields = value.replace(',', '.').split("[:.]");
        int hours = fields.length == 4 ? Integer.parseInt(fields[0]) : 0;
        int minutes = Integer.parseInt(fields[fields.length - 3]);
        int seconds = Integer.parseInt(fields[fields.length - 2]);
        if (minutes > 59 || seconds > 59) throw new IOException("字幕时间无效");
        return ((hours * 60L + minutes) * 60L + seconds) * 1000L + Integer.parseInt(fields[fields.length - 1]);
    }

    private static String stamp(long value) {
        return String.format(Locale.ROOT, "%02d:%02d:%02d.%03d", value / 3600000, value / 60000 % 60, value / 1000 % 60, value % 1000);
    }
}
