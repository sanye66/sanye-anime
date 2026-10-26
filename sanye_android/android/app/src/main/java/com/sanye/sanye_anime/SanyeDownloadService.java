package com.sanye.sanye_anime;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SanyeDownloadService extends Service {
    private static final String CHANNEL = "sanye_downloads";
    private static final int NOTIFICATION_ID = 8201;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private DownloadRuntime runtime;
    private boolean destroyed;
    @Override public void onCreate() {
        super.onCreate();
        getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "离线视频下载", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            runtime = DownloadRuntime.get(this);
            startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            runtime.start();
            worker.execute(() -> {
                try { runtime.drain(() -> main.post(() -> {
                    if (!destroyed) startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                })); }
                catch (IOException failure) { Log.e("SanyeDownload", "下载队列写入失败", failure); }
                finally { main.post(() -> stopSelf(startId)); }
            });
        } catch (IOException | RuntimeException failure) {
            if (runtime != null) runtime.unavailable();
            Log.e("SanyeDownload", "下载服务无法启动", failure);
            stopSelf(startId);
        }
        return START_NOT_STICKY;
    }
    private Notification notification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("离线视频下载")
                .setContentText("正在处理下载队列").setOngoing(true).setOnlyAlertOnce(true);
        if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (runtime != null) {
            List<DownloadStore.Item> items = runtime.store.list();
            for (DownloadStore.Item item : items) if (item.state.equals("downloading")) {
                builder.setContentText(item.title).setProgress(100, item.total > 0 ? (int) (item.bytes * 100 / item.total) : 0, item.total == 0);
                break;
            }
        }
        return builder.build();
    }
    @Override public void onTimeout(int startId, int foregroundServiceType) {
        if (runtime != null) runtime.stop();
        stopSelf();
    }
    @Override public void onDestroy() {
        destroyed = true;
        if (runtime != null) runtime.stop();
        worker.shutdownNow();
        main.removeCallbacksAndMessages(null);
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
