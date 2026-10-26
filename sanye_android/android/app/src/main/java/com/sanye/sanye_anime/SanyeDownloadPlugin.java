package com.sanye.sanye_anime;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;

@CapacitorPlugin(name = "SanyeDownload")
public class SanyeDownloadPlugin extends Plugin {
    private DownloadRuntime runtime() throws IOException { return DownloadRuntime.get(getContext()); }
    private void startService() {
        getContext().startForegroundService(new Intent(getContext(), SanyeDownloadService.class));
    }
    private JSObject snapshot() throws IOException {
        DownloadStore store = runtime().store;
        JSArray items = new JSArray();
        for (DownloadStore.Item item : store.list()) {
            JSObject value = new JSObject();
            value.put("id", item.id); value.put("title", item.title); value.put("state", item.state);
            value.put("bytes", item.bytes); value.put("total", item.total); value.put("error", item.error);
            value.put("createdAt", item.createdAt);
            value.put("position", item.position); value.put("duration", item.duration); value.put("mimeType", "video/mp4");
            items.put(value);
        }
        JSObject result = new JSObject();
        result.put("items", items); result.put("usedBytes", store.usedBytes());
        result.put("maxStorageBytes", DownloadStore.MAX_STORAGE_BYTES); result.put("maxFileBytes", DownloadFetchPolicy.MAX_FILE_BYTES);
        return result;
    }
    private void reject(PluginCall call, Exception failure) {
        call.reject(failure instanceof IOException ? failure.getMessage() : "下载服务不可用，请返回应用前台后重试", "E_DOWNLOAD");
    }
    @PluginMethod public void list(PluginCall call) {
        try {
            if (!runtime().error().isEmpty()) throw new IOException(runtime().error());
            call.resolve(snapshot());
        } catch (Exception failure) { reject(call, failure); }
    }
    @PluginMethod public void resume(PluginCall call) {
        try {
            if (runtime().store.list().stream().anyMatch(item -> item.state.equals("queued"))) startService();
            call.resolve(snapshot());
        } catch (Exception failure) { reject(call, failure); }
    }
    @PluginMethod public void enqueue(PluginCall call) {
        DownloadStore.Item item = null;
        try {
            item = runtime().store.add(call.getString("url", ""), call.getString("title", ""));
            startService(); call.resolve(snapshot());
        } catch (Exception failure) {
            if (item != null) try { runtime().store.fail(item, "下载服务启动失败，请重试"); } catch (IOException ignored) {}
            reject(call, failure);
        }
    }
    @PluginMethod public void cancel(PluginCall call) {
        try { runtime().cancel(call.getString("id", "")); call.resolve(snapshot()); }
        catch (Exception failure) { reject(call, failure); }
    }
    @PluginMethod public void retry(PluginCall call) {
        DownloadStore.Item item = null;
        try {
            String id = call.getString("id", "");
            runtime().retry(id); item = runtime().store.get(id);
            startService(); call.resolve(snapshot());
        }
        catch (Exception failure) {
            if (item != null) try { runtime().store.fail(item, "下载服务启动失败，请重试"); } catch (IOException ignored) {}
            reject(call, failure);
        }
    }
    @PluginMethod public void remove(PluginCall call) {
        try { runtime().remove(call.getString("id", ""), Boolean.TRUE.equals(call.getBoolean("confirmed"))); call.resolve(snapshot()); }
        catch (Exception failure) { reject(call, failure); }
    }
    @PluginMethod public void play(PluginCall call) {
        try {
            String id = call.getString("id", "");
            JSObject result = new JSObject();
            result.put("path", "file://" + runtime().store.playable(id).getAbsolutePath());
            DownloadStore.Item item = runtime().store.get(id);
            result.put("id", id); result.put("title", item.title);
            result.put("position", item.position); result.put("duration", item.duration); result.put("mimeType", "video/mp4");
            call.resolve(result);
        } catch (Exception failure) { reject(call, failure); }
    }
    @PluginMethod public void recordProgress(PluginCall call) {
        try {
            Double position = call.getDouble("position"); Double duration = call.getDouble("duration");
            if (position == null || duration == null) throw new IOException("离线观看进度无效");
            runtime().store.recordProgress(call.getString("id", ""), position, duration);
            call.resolve();
        } catch (Exception failure) { reject(call, failure); }
    }
}
