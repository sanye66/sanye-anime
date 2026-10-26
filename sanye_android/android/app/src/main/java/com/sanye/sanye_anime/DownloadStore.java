package com.sanye.sanye_anime;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.stream.Collectors;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class DownloadStore {
    static final long MAX_STORAGE_BYTES = 2L * 1024 * 1024 * 1024;
    static final long RESERVED_BYTES = 64L * 1024 * 1024;
    static final int MAX_TASKS = 32;
    final File root;
    private final List<Item> items = new ArrayList<>();
    static final class Item {
        final String id;
        final String url;
        final String title;
        String state;
        String error = "";
        long bytes;
        long total;
        String etag = "";
        String checksum = "";
        double position;
        double duration;
        final long createdAt;
        Item(String id, String url, String title, String state, long createdAt) {
            this.id = id; this.url = url; this.title = title; this.state = state; this.createdAt = createdAt;
        }
        Item copy() {
            Item result = new Item(id, url, title, state, createdAt);
            result.error = error; result.bytes = bytes; result.total = total;
            result.etag = etag; result.checksum = checksum; result.position = position; result.duration = duration;
            return result;
        }
    }
    DownloadStore(File root) throws IOException {
        this.root = root.getCanonicalFile();
        if (!this.root.isDirectory() && !this.root.mkdirs()) throw new IOException("下载目录不可用");
        File index = new File(this.root, "queue.bin");
        if (index.isFile()) {
            try (DataInputStream input = new DataInputStream(new FileInputStream(index))) {
                int version = input.readInt();
                if (version != 1 && version != 2) throw new IOException("下载队列版本不支持");
                int count = input.readInt();
                if (count < 0 || count > MAX_TASKS) throw new IOException("下载队列损坏");
                for (int position = 0; position < count; position++) {
                    Item item = new Item(input.readUTF(), input.readUTF(), input.readUTF(), input.readUTF(), input.readLong());
                    file(item, false);
                    item.error = input.readUTF(); item.bytes = input.readLong(); item.total = input.readLong();
                    if (version >= 2) {
                        item.etag = input.readUTF(); item.checksum = input.readUTF();
                        item.position = input.readDouble(); item.duration = input.readDouble();
                        if (!validProgress(item.position, item.duration)
                                || !item.etag.isEmpty() && !DownloadFetchPolicy.strongEtag(item.etag)
                                || !item.checksum.isEmpty() && !item.checksum.matches("[0-9a-f]{64}")) throw new IOException("下载队列媒体信息无效");
                    }
                    if (item.bytes < 0 || item.total < 0 || item.bytes > item.total
                            || item.total > DownloadFetchPolicy.MAX_FILE_BYTES) throw new IOException("下载队列文件大小无效");
                    if (item.state.equals("downloading")) item.state = "queued";
                    if (item.state.equals("completed") && (!file(item, false).isFile()
                            || file(item, false).length() != item.total || item.total < 16
                            || !validMp4(file(item, false), item.total)
                            || !item.checksum.isEmpty() && !item.checksum.equals(digest(file(item, false))))) {
                        item.state = "failed"; item.error = "本地文件丢失或不完整，请重试";
                    }
                    if (item.state.equals("completed") && item.checksum.isEmpty()) item.checksum = digest(file(item, false));
                    if (!Arrays.asList("queued", "completed", "failed", "cancelled").contains(item.state)) {
                        throw new IOException("下载队列状态无效");
                    }
                    if (!item.state.equals("completed")) preparePartial(item);
                    if (items.stream().anyMatch(existing -> existing.id.equals(item.id))) throw new IOException("下载任务标识重复");
                    items.add(item);
                }
            }
            save();
        }
    }
    synchronized List<Item> list() { return items.stream().map(Item::copy).collect(Collectors.toList()); }
    synchronized Item get(String id) throws IOException {
        return items.stream().filter(item -> item.id.equals(id)).findFirst().orElseThrow(() -> new IOException("下载任务不存在"));
    }
    synchronized Item add(String url, String title) throws IOException {
        DownloadFetchPolicy.validate(url);
        if (title == null || title.trim().isEmpty() || title.length() > 200) throw new IOException("请填写不超过 200 字的下载名称");
        if (items.size() >= MAX_TASKS) throw new IOException("最多保留 32 个下载任务，请删除不用的任务");
        if (items.stream().anyMatch(item -> item.url.equals(url) && !item.state.equals("cancelled") && !item.state.equals("failed"))) {
            throw new IOException("该视频已在下载列表中");
        }
        Item item = new Item(UUID.randomUUID().toString(), url, title.trim(), "queued", System.currentTimeMillis());
        items.add(item);
        try { save(); } catch (IOException failure) { items.remove(item); throw failure; }
        return item;
    }
    synchronized Item next() throws IOException {
        for (Item item : items) if (item.state.equals("queued")) {
            preparePartial(item); removeFile(file(item, false));
            item.state = "downloading"; item.error = "";
            save(); return item;
        }
        return null;
    }
    synchronized void progress(Item item, long bytes, long total, boolean persist) throws IOException {
        checkActive(item);
        if (bytes < 0 || bytes > total || total < 16 || total > DownloadFetchPolicy.MAX_FILE_BYTES) throw new IOException("下载进度无效");
        item.bytes = bytes; item.total = total;
        if (persist) save();
    }
    synchronized void complete(Item item) throws IOException {
        checkActive(item);
        File part = file(item, true);
        if (part.length() != item.total || item.total < 16 || !validMp4(part, item.total)) throw new IOException("下载文件不完整");
        item.checksum = digest(part);
        Files.move(part.toPath(), file(item, false).toPath(), StandardCopyOption.ATOMIC_MOVE);
        item.state = "completed"; save();
    }
    synchronized void fail(Item item, String error) throws IOException {
        if (!item.state.equals("cancelled")) { item.state = "failed"; item.error = error; }
        preparePartial(item); save();
    }
    synchronized void cancel(String id) throws IOException {
        Item item = get(id);
        if (!item.state.equals("queued") && !item.state.equals("downloading")) throw new IOException("该任务无需取消");
        item.state = "cancelled"; item.error = ""; save();
    }
    synchronized void retry(String id) throws IOException {
        Item item = get(id);
        if (!item.state.equals("failed") && !item.state.equals("cancelled")) throw new IOException("该任务无需重试");
        preparePartial(item); item.state = "queued"; item.error = ""; save();
    }
    synchronized void delete(String id, boolean confirmed) throws IOException {
        if (!confirmed) throw new IOException("请先确认删除下载文件");
        Item item = get(id);
        if (item.state.equals("downloading")) throw new IOException("请先取消下载再删除");
        removeFile(file(item, true)); removeFile(file(item, false)); items.remove(item); save();
    }
    synchronized File playable(String id) throws IOException {
        Item item = get(id);
        File file = file(item, false);
        if (!item.state.equals("completed") || !file.isFile() || file.length() != item.total
                || !validMp4(file, item.total) || !digest(file).equals(item.checksum)) throw new IOException("下载尚未完成或文件已丢失或损坏");
        return file;
    }
    synchronized void checkActive(Item item) throws IOException {
        if (!item.state.equals("downloading") || Thread.currentThread().isInterrupted()) throw new IOException("下载已取消");
    }
    synchronized long usedBytes() throws IOException {
        long used = 0;
        for (Item item : items) { used += file(item, true).length(); used += file(item, false).length(); }
        return used;
    }
    synchronized void checkSpace(Item item, long incomingBytes) throws IOException {
        checkActive(item);
        if (usedBytes() + incomingBytes > MAX_STORAGE_BYTES) throw new IOException("下载空间超过 2 GiB 上限，请删除不用的下载");
        if (root.getUsableSpace() - incomingBytes < RESERVED_BYTES) throw new IOException("设备空间不足，至少保留 64 MiB 可用空间");
    }
    File file(Item item, boolean partial) throws IOException {
        if (!item.id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new IOException("下载文件标识无效");
        File result = new File(root, item.id + (partial ? ".part" : ".mp4")).getCanonicalFile();
        if (!result.getParentFile().equals(root)) throw new IOException("下载文件越界");
        return result;
    }
    private void removeFile(File file) throws IOException {
        if (file.exists() && !file.delete()) throw new IOException("下载文件无法删除");
    }
    synchronized void metadata(Item item, String etag, long total) throws IOException {
        checkActive(item); item.etag = etag; item.total = total; save();
    }
    synchronized void restarted(Item item) throws IOException {
        checkActive(item); item.bytes = 0; item.total = 0; item.etag = ""; save();
    }
    synchronized void recordProgress(String id, double position, double duration) throws IOException {
        Item item = get(id);
        if (!item.state.equals("completed")) throw new IOException("下载尚未完成");
        if (!validProgress(position, duration)) throw new IOException("离线观看进度无效");
        item.position = position; item.duration = duration; save();
    }
    private void preparePartial(Item item) throws IOException {
        File part = file(item, true);
        if (!DownloadFetchPolicy.strongEtag(item.etag) || item.bytes < 12 || item.bytes > item.total
                || part.length() < item.bytes || !validMp4(part, item.total)) {
            removeFile(part); item.bytes = 0; item.total = 0; item.etag = "";
        } else if (part.length() != item.bytes) {
            try (RandomAccessFile output = new RandomAccessFile(part, "rw")) { output.setLength(item.bytes); }
        }
    }
    private static boolean validProgress(double position, double duration) {
        return Double.isFinite(position) && Double.isFinite(duration) && position >= 0 && duration >= 0
                && position <= duration && duration <= 7 * 24 * 3600;
    }
    static boolean validMp4(File file, long total) throws IOException {
        if (!file.isFile() || file.length() < 12) return false;
        try (DataInputStream input = new DataInputStream(new FileInputStream(file))) {
            long box = input.readInt() & 0xffffffffL;
            return box >= 16 && box <= total && input.readInt() == 0x66747970;
        }
    }
    private static String digest(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[64 * 1024]; int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            StringBuilder value = new StringBuilder();
            for (byte part : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", part & 255));
            return value.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IOException("文件校验不可用", impossible); }
    }
    private synchronized void save() throws IOException {
        File staging = new File(root, "queue.tmp");
        try (FileOutputStream stream = new FileOutputStream(staging); DataOutputStream output = new DataOutputStream(stream)) {
            output.writeInt(2); output.writeInt(items.size());
            for (Item item : items) {
                output.writeUTF(item.id); output.writeUTF(item.url); output.writeUTF(item.title); output.writeUTF(item.state);
                output.writeLong(item.createdAt); output.writeUTF(item.error); output.writeLong(item.bytes); output.writeLong(item.total);
                output.writeUTF(item.etag); output.writeUTF(item.checksum); output.writeDouble(item.position); output.writeDouble(item.duration);
            }
            output.flush(); stream.getFD().sync();
        }
        Files.move(staging.toPath(), new File(root, "queue.bin").toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }
}
