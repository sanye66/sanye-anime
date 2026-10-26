package com.sanye.sanye_anime;

import java.io.File;
import java.io.IOException;
import java.net.URI;

final class Media3PlaybackPolicy {
    static final int MAX_REDIRECTS = 5;

    /** 只接收防盗链所需的无凭据字段，禁止任意请求头和控制字符。 */
    static java.util.Map<String, String> requestHeaders(java.util.Map<String, String> values) throws IOException {
        java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
        for (var entry : values.entrySet()) {
            String name = entry.getKey(), value = entry.getValue();
            if (!name.equals("Referer") && !name.equals("User-Agent")) throw new IOException("不支持的媒体请求头");
            if (value == null || value.length() > 2048 || value.chars().anyMatch(c -> c < 32 || c == 127)) throw new IOException("媒体请求头无效");
            if (value.isBlank()) continue;
            if (name.equals("Referer")) networkUri(value);
            else if (value.length() > 512) throw new IOException("播放器标识过长");
            result.put(name, value);
        }
        return java.util.Collections.unmodifiableMap(result);
    }

    static URI networkUri(String value) throws IOException {
        URI uri = SubscriptionFetchPolicy.validateUrl(value);
        String host = uri.getHost().replace("[", "").replace("]", "");
        if ((host.matches("[0-9.]+") || host.contains(":"))
                && !SubscriptionFetchPolicy.isPublic(java.net.InetAddress.getByName(host))) throw new IOException("媒体地址不能访问私网或保留地址");
        return uri;
    }

    static File completedFile(String value, DownloadStore store) throws IOException {
        try {
            URI uri = URI.create(value);
            if (!"file".equals(uri.getScheme()) || uri.getRawAuthority() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null) {
                throw new IOException("只能播放应用已完成的下载文件");
            }
            File file = new File(uri).getCanonicalFile();
            for (DownloadStore.Item item : store.list()) {
                if (item.state.equals("completed") && store.file(item, false).equals(file)) return store.playable(item.id);
            }
            throw new IOException("只能播放应用已完成的下载文件");
        } catch (IllegalArgumentException invalid) {
            throw new IOException("本地播放地址无效", invalid);
        }
    }

    static double finite(double value, double minimum, double maximum, double fallback) {
        return Double.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
    }

    static float rate(double value) {
        for (float allowed : new float[]{0.75f, 1, 1.25f, 1.5f, 2}) {
            if (Math.abs(value - allowed) < 0.0001) return allowed;
        }
        return 1;
    }

    static int firstFrameBudget(double value) {
        if (value != 20000 && value != 30000) throw new IllegalArgumentException("起播预算只能为 20000 或 30000 毫秒");
        return (int) value;
    }

    static String videoTrackLabel(int width, int height, int bitrate) {
        String resolution = width > 0 && height > 0 ? width + " × " + height : "";
        String rate = bitrate > 0 ? String.format(java.util.Locale.ROOT, "%.0f kbps", bitrate / 1000.0) : "";
        if (resolution.isEmpty()) return rate.isEmpty() ? null : rate;
        return rate.isEmpty() ? resolution : resolution + " · " + rate;
    }
}
