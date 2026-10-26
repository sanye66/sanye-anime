package com.sanye.sanye_anime;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import okhttp3.Call;

@CapacitorPlugin(name = "SanyeCover")
public class SanyeCoverPlugin extends Plugin {
    private final Set<Call> active = ConcurrentHashMap.newKeySet();
    private final AtomicLong generation = new AtomicLong();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(16), runnable -> new Thread(runnable, "sanye-cover"));

    @PluginMethod
    public void fetch(PluginCall call) {
        long epoch = generation.get();
        try {
            workers.execute(() -> {
                try {
                    CoverFetchPolicy.Image image = CoverFetchPolicy.fetch(call.getString("url"), active, epoch, generation::get);
                    if (generation.get() != epoch) { call.reject("封面请求已取消"); return; }
                    JSObject result = new JSObject();
                    result.put("mime", image.mime());
                    result.put("data", Base64.encodeToString(image.bytes(), Base64.NO_WRAP));
                    call.resolve(result);
                } catch (Exception invalid) { call.reject("封面下载失败", invalid); }
            });
        } catch (RejectedExecutionException busy) { call.reject("封面下载繁忙"); }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelRequests();
        call.resolve();
    }

    private void cancelRequests() {
        generation.incrementAndGet();
        for (Call request : active) request.cancel();
    }

    @Override
    protected void handleOnDestroy() {
        cancelRequests();
        workers.shutdown();
    }
}
