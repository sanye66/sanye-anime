package com.sanye.sanye_anime;

import android.util.Base64;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.concurrent.*;
import okhttp3.*;

/** 详情播放器的清单/分片读取，不执行网页脚本或向私网请求。 */
@androidx.annotation.OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "SanyeMediaFetch")
public class SanyeMediaFetchPlugin extends Plugin {
    private static final int MAX_BYTES = 16 * 1024 * 1024;
    private final ConcurrentHashMap<String, Call> active = new ConcurrentHashMap<>();
    private final java.util.Set<String> pending = ConcurrentHashMap.newKeySet();
    private final java.util.Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(3, 3, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(12), task -> new Thread(task, "sanye-inline-media"));
    private final OkHttpClient client = Media3SafeDataSource.networkClient().newBuilder().callTimeout(20, TimeUnit.SECONDS).build();

    @PluginMethod public void read(PluginCall call) {
        String id = call.getString("id", "");
        if (id.isBlank() || id.length() > 160 || !pending.add(id)) { call.reject("媒体请求标识无效"); return; }
        try { workers.execute(() -> {
            try {
                String url = call.getString("url", "");
                Media3PlaybackPolicy.networkUri(url);
                Map<String, String> headers = new java.util.LinkedHashMap<>();
                JSObject supplied = call.getObject("headers");
                if (supplied != null) {
                    var keys = supplied.keys();
                    while (keys.hasNext()) { String key = keys.next(); Object value = supplied.get(key); if (!(value instanceof String)) throw new IllegalArgumentException("请求头无效"); headers.put(key, (String)value); }
                }
                headers = Media3PlaybackPolicy.requestHeaders(headers);
                Request.Builder builder = new Request.Builder().url(url).header("User-Agent", headers.getOrDefault("User-Agent", "Mozilla/5.0"));
                for (var header : headers.entrySet()) builder.header(header.getKey(), header.getValue());
                Double start = call.getDouble("rangeStart"), end = call.getDouble("rangeEnd");
                if (start != null) {
                    if (!Double.isFinite(start) || start < 0 || start != Math.rint(start) || start > Long.MAX_VALUE
                            || end != null && (!Double.isFinite(end) || end <= start || end != Math.rint(end))) throw new IllegalArgumentException("媒体范围无效");
                    builder.header("Range", "bytes=" + start.longValue() + "-" + (end == null ? "" : Long.toString(end.longValue() - 1)));
                }
                Call request = client.newCall(builder.build()); active.put(id, request);
                if (cancelled.contains(id)) { request.cancel(); throw new java.io.IOException("媒体请求已取消"); }
                long started = System.nanoTime();
                try (Response response = request.execute()) {
                    if (!response.isSuccessful() || response.body() == null) throw new java.io.IOException("媒体响应 " + response.code());
                    if (response.body().contentLength() > MAX_BYTES) throw new java.io.IOException("媒体分片过大");
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    try (var input = response.body().byteStream()) {
                        byte[] buffer = new byte[32768];
                        for (int count; (count = input.read(buffer)) != -1;) {
                            if (count > MAX_BYTES - output.size()) throw new java.io.IOException("媒体分片过大");
                            output.write(buffer, 0, count);
                        }
                    }
                    if (cancelled.contains(id)) throw new java.io.IOException("媒体请求已取消");
                    JSObject result = new JSObject(); result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                    result.put("url", response.request().url().toString()); result.put("status", response.code()); result.put("elapsedMs", (System.nanoTime() - started) / 1_000_000.0);
                    call.resolve(result);
                }
            } catch (Exception failure) { call.reject(failure.getMessage(), "E_MEDIA_FETCH", failure); }
            finally { active.remove(id); pending.remove(id); cancelled.remove(id); }
        }); } catch (RejectedExecutionException busy) { pending.remove(id); call.reject("媒体请求繁忙"); }
    }

    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id", "");
        if (pending.contains(id)) { cancelled.add(id); Call request = active.get(id); if (request != null) request.cancel(); }
        call.resolve();
    }
    @Override protected void handleOnDestroy() {
        for (Call call : active.values()) call.cancel();
        workers.shutdownNow(); client.connectionPool().evictAll(); super.handleOnDestroy();
    }
}
