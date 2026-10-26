package com.sanye.sanye_anime;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SanyeBackupFiles")
public class SanyeBackupFilesPlugin extends Plugin {
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private boolean pending;

    @PluginMethod
    public synchronized void save(PluginCall call) {
        String content = call.getString("content");
        String name = call.getString("name", "sanye-backup.json");
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES
            || !name.matches("[a-zA-Z0-9_-]+\\.json")) {
            call.reject("备份文件无效或超过 10MB");
            return;
        }
        if (pending) { call.reject("请先完成当前文件操作"); return; }
        pending = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(call, intent, "saved"); }
        catch (Exception failure) { pending = false; call.reject("无法打开系统文件保存", failure); }
    }

    @PluginMethod
    public synchronized void pick(PluginCall call) {
        if (pending) { call.reject("请先完成当前文件操作"); return; }
        pending = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try { startActivityForResult(call, intent, "picked"); }
        catch (Exception failure) { pending = false; call.reject("无法打开系统文件选择", failure); }
    }

    private Uri selected(PluginCall call, ActivityResult result) {
        pending = false;
        if (call == null) return null;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.resolve(new JSObject().put("cancelled", true));
            return null;
        }
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null || !"content".equals(uri.getScheme())) {
            call.reject("系统未返回可用文件");
            return null;
        }
        return uri;
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        Uri uri = selected(call, result);
        if (uri == null) return;
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new java.io.IOException();
            output.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (Exception failure) { call.reject("文件保存失败，请重新选择位置", failure); return; }
        call.resolve(new JSObject().put("cancelled", false));
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Uri uri = selected(call, result);
        if (uri == null) return;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new java.io.IOException();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > MAX_BYTES) throw new java.io.IOException("文件超过 10MB");
                output.write(buffer, 0, count);
            }
            String content = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(output.toByteArray())).toString();
            call.resolve(new JSObject().put("cancelled", false).put("content", content));
        } catch (Exception failure) { call.reject("文件读取失败或超过 10MB", failure); }
    }
}
