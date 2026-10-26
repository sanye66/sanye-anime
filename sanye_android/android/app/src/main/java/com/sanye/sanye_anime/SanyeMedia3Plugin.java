package com.sanye.sanye_anime;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.UUID;

@androidx.annotation.OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "SanyeMedia3")
public class SanyeMedia3Plugin extends Plugin {
    private static WeakReference<SanyeMedia3Plugin> bridge = new WeakReference<>(null);
    private WeakReference<SanyeMediaPlayerActivity> screen = new WeakReference<>(null);
    private String currentId = "";
    private String token = "";
    private Bundle pending;

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("native", true);
        result.put("seamlessHandoff", true);
        result.put("inPlaceSwitch", true);
        result.put("hls", true);
        result.put("mp4", true);
        try {
            android.content.pm.PackageInfo installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("appVersion", installed.versionName);
            result.put("appBuild", installed.getLongVersionCode());
        } catch (android.content.pm.PackageManager.NameNotFoundException unavailable) { /* 版本未知时省略，不伪造。 */ }
        result.put("androidSdk", android.os.Build.VERSION.SDK_INT);
        result.put("manufacturer", android.os.Build.MANUFACTURER);
        result.put("model", android.os.Build.MODEL);
        result.put("engine", "media3-1.8.0");
        result.put("pictureInPicture", getContext().getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE));
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("播放器界面不可用", "E_MEDIA3_ACTIVITY"); return; }
        try {
            String id = call.getString("id", "").trim();
            String url = call.getString("url", "").trim();
            if (id.isEmpty() || id.length() > 160) throw new IllegalArgumentException("播放会话标识无效");
            if (url.startsWith("file:")) Media3PlaybackPolicy.completedFile(url, DownloadRuntime.get(getContext()).store);
            else Media3PlaybackPolicy.networkUri(url);
            String mime = call.getString("mimeType", "");
            if (mime.isEmpty()) mime = "hls".equals(call.getString("type", "")) ? "application/x-mpegURL" : "video/mp4";
            if (!mime.equals("video/mp4") && !mime.equals("application/x-mpegURL")
                    && !mime.equals("application/vnd.apple.mpegurl")) throw new IllegalArgumentException("仅支持 MP4 和 HLS");
            Bundle request = new Bundle();
            request.putString("id", id);
            request.putString("url", url);
            request.putString("mimeType", mime);
            java.util.Map<String, String> headers = new java.util.LinkedHashMap<>();
            JSObject supplied = call.getObject("requestHeaders");
            if (supplied != null) {
                java.util.Iterator<String> keys = supplied.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    Object value = supplied.get(key);
                    if (!(value instanceof String)) throw new IllegalArgumentException("媒体请求头必须为字符串");
                    headers.put(key, (String) value);
                }
            }
            for (var header : Media3PlaybackPolicy.requestHeaders(headers).entrySet()) request.putString("header:" + header.getKey(), header.getValue());
            request.putString("title", call.getString("title", "正在播放"));
            com.getcapacitor.JSArray choices = call.getArray("choices");
            if (choices != null) {
                if (choices.length() > 500) throw new IllegalArgumentException("选集数量超出范围");
                java.util.ArrayList<Bundle> entries = new java.util.ArrayList<>();
                java.util.HashSet<String> ids = new java.util.HashSet<>();
                for (int i = 0; i < choices.length(); i++) {
                    org.json.JSONObject choice = choices.getJSONObject(i);
                    String choiceId = choice.getString("id"), label = choice.getString("label");
                    if (choiceId.isEmpty() || choiceId.length() > 1024 || label.isBlank() || label.length() > 160 || !ids.add(choiceId)) throw new IllegalArgumentException("选集信息无效");
                    Bundle entry = new Bundle(); entry.putString("id", choiceId); entry.putString("label", label);
                    String group = choice.optString("group", "选集");
                    if (group.isBlank() || group.length() > 160) throw new IllegalArgumentException("线路名称无效");
                    entry.putString("group", group);
                    entry.putBoolean("selected", choice.optBoolean("selected", false)); entries.add(entry);
                }
                request.putParcelableArrayList("choices", entries);
            }
            request.putString("episode", call.getString("episode", ""));
            request.putDouble("position", Media3PlaybackPolicy.finite(call.getDouble("position", 0.0), 0, 86400000, 0));
            request.putFloat("rate", Media3PlaybackPolicy.rate(call.getDouble("rate", 1.0)));
            request.putFloat("volume", (float) Media3PlaybackPolicy.finite(call.getDouble("volume", 1.0), 0, 1, 1));
            request.putBoolean("autoPlay", call.getBoolean("autoPlay", true));
            request.putBoolean("autoNext", call.getBoolean("autoNext", false));
            request.putBoolean("lightTheme", call.getBoolean("lightTheme", false));
            request.putBoolean("hasNext", call.getBoolean("hasNext", true));
            request.putBoolean("hasPrevious", call.getBoolean("hasPrevious", false));
            request.putInt("firstFrameTimeoutMs", Media3PlaybackPolicy.firstFrameBudget(call.getData().has("firstFrameTimeoutMs")
                    ? call.getDouble("firstFrameTimeoutMs", Double.NaN) : 30000.0));
            activity.runOnUiThread(() -> {
                try {
                    String replaceId = call.getString("replaceId", "");
                    if (!replaceId.isEmpty() && (!replaceId.equals(currentId) || screen.get() == null || screen.get().isFinishing())) {
                        call.reject("待切换播放窗口已关闭", "E_MEDIA3_REPLACE"); return;
                    }
                    if (pending != null) { closePending(); pending = null; }
                    bridge = new WeakReference<>(this);
                    currentId = id;
                    token = UUID.randomUUID().toString();
                    request.putString("token", token);
                    SanyeMediaPlayerActivity existing = screen.get();
                    if (existing != null && !existing.isFinishing()) existing.replace(request);
                    else {
                        pending = new Bundle(request);
                        Intent intent = new Intent(activity, SanyeMediaPlayerActivity.class);
                        intent.putExtra("request", request);
                        activity.startActivity(intent);
                    }
                    call.resolve(new JSObject().put("accepted", true));
                } catch (Exception failure) {
                    SanyeMediaPlayerActivity failedScreen = screen.get();
                    if (failedScreen != null) failedScreen.close("closed", null);
                    currentId = "";
                    token = "";
                    pending = null;
                    call.reject("原生播放器启动失败", "E_MEDIA3_OPEN", failure);
                }
            });
        } catch (Exception failure) {
            call.reject(failure.getMessage(), "E_MEDIA3_SOURCE", failure);
        }
    }

    @PluginMethod
    public void transitionFailed(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.resolve(); return; }
        String id = call.getString("id", "");
        activity.runOnUiThread(() -> {
            if (id.equals(currentId)) {
                SanyeMediaPlayerActivity existing = screen.get();
                if (existing != null) existing.transitionFailed();
                else closePending();
                currentId = ""; token = ""; pending = null;
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.resolve(); return; }
        String id = call.getString("id", "");
        activity.runOnUiThread(() -> {
            if (id.equals(currentId)) {
                SanyeMediaPlayerActivity existing = screen.get();
                if (existing != null) existing.close("closed", null);
                else closePending();
                currentId = "";
                token = "";
                pending = null;
            }
            call.resolve();
        });
    }

    static SanyeMedia3Plugin owner(Bundle request) {
        SanyeMedia3Plugin plugin = bridge.get();
        return plugin != null && request != null && plugin.currentId.equals(request.getString("id"))
                && plugin.token.equals(request.getString("token")) ? plugin : null;
    }

    void attach(SanyeMediaPlayerActivity activity) { screen = new WeakReference<>(activity); pending = null; }

    void detach(SanyeMediaPlayerActivity activity, String sessionToken) {
        if (screen.get() == activity) screen.clear();
        if (token.equals(sessionToken)) { currentId = ""; token = ""; }
    }

    void emit(JSObject state) { notifyListeners("playbackState", state, state.optBoolean("closed", false)); }

    private void closePending() {
        if (pending == null) return;
        JSObject state = new JSObject();
        state.put("id", pending.getString("id"));
        state.put("position", pending.getDouble("position", 0));
        state.put("duration", 0);
        state.put("playing", false);
        state.put("buffering", false);
        state.put("firstFrame", false);
        state.put("ended", false);
        state.put("closed", true);
        state.put("reason", "closed");
        state.put("rate", pending.getFloat("rate", 1));
        state.put("watchedSeconds", 0);
        state.put("stallSeconds", 0);
        emit(state);
    }

    @Override
    protected void handleOnDestroy() {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> {
            SanyeMediaPlayerActivity existing = screen.get();
            if (existing != null) existing.close("closed", null);
            else closePending();
            screen.clear();
            currentId = "";
            token = "";
            pending = null;
            if (bridge.get() == this) bridge.clear();
        });
        super.handleOnDestroy();
    }
}
