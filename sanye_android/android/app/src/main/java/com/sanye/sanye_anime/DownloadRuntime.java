package com.sanye.sanye_anime;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.Socket;

final class DownloadRuntime {
    private static DownloadRuntime instance;
    final DownloadStore store;
    private String activeId;
    private Socket socket;
    private boolean stopping;
    private volatile String queueError = "";
    private DownloadRuntime(Context context) throws IOException {
        store = new DownloadStore(new File(context.getFilesDir(), "sanye_downloads"));
    }
    static synchronized DownloadRuntime get(Context context) throws IOException {
        if (instance == null) instance = new DownloadRuntime(context.getApplicationContext());
        return instance;
    }
    synchronized void cancel(String id) throws IOException {
        store.cancel(id);
        if (id.equals(activeId) && socket != null) socket.close();
    }
    synchronized void retry(String id) throws IOException {
        if (id.equals(activeId)) throw new IOException("正在结束下载，请稍后重试");
        store.retry(id);
    }
    synchronized void remove(String id, boolean confirmed) throws IOException {
        if (id.equals(activeId)) throw new IOException("正在结束下载，请稍后删除");
        store.delete(id, confirmed);
    }
    synchronized void start() { stopping = false; }
    String error() { return queueError; }
    void unavailable() { queueError = "后台下载服务暂不可用，请稍后在应用前台重新打开下载列表"; }
    synchronized void stop() {
        stopping = true;
        if (socket != null) try { socket.close(); } catch (IOException ignored) {}
    }
    void drain(Runnable changed) throws IOException {
        queueError = "";
        try {
        while (!Thread.currentThread().isInterrupted()) {
            DownloadStore.Item item;
            synchronized (this) {
                if (stopping) return;
                item = store.next();
                if (item == null) return;
                activeId = item.id;
            }
            try {
                try (FileOutputStream output = new FileOutputStream(store.file(item, true), true)) {
                    if (item.bytes < item.total || item.total == 0) {
                    DownloadFetchPolicy.download(item.url, output, new DownloadFetchPolicy.Transfer() {
                        private long lastSaved;
                        public void connected(Socket connection) throws IOException {
                            synchronized (DownloadRuntime.this) {
                                store.checkActive(item);
                                if (stopping) throw new IOException("下载服务已停止，请重试");
                                socket = connection;
                            }
                        }
                        public void check(long bytes) throws IOException { store.checkSpace(item, bytes); }
                        public void metadata(String etag, long total) throws IOException { store.metadata(item, etag, total); }
                        public void restart() throws IOException {
                            output.getChannel().truncate(0); output.getChannel().position(0); store.restarted(item);
                        }
                        public void progress(long bytes, long total) throws IOException {
                            long now = System.nanoTime();
                            boolean persist = now - lastSaved > 1_000_000_000L || bytes == total;
                            if (persist) { output.flush(); output.getFD().sync(); }
                            store.progress(item, bytes, total, persist);
                            if (persist) { lastSaved = now; changed.run(); }
                        }
                    }, item.bytes, item.etag, item.total);
                    }
                    output.flush(); output.getFD().sync();
                }
                store.complete(item);
            } catch (Exception failure) {
                String detail = failure.getMessage();
                String message = failure instanceof IOException && detail != null && detail.matches(".*[一-龥].*")
                        ? detail : "网络连接失败或超时，请检查网络后重试";
                store.fail(item, message == null ? "下载失败，请重试" : message);
            } finally {
                synchronized (this) { activeId = null; socket = null; }
                changed.run();
            }
        }
        } catch (IOException failure) {
            queueError = "下载队列无法保存，请检查设备储存空间后重新打开应用";
            throw failure;
        }
    }
}
