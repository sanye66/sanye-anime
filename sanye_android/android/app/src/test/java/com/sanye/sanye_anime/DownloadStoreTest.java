package com.sanye.sanye_anime;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;

public class DownloadStoreTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private DownloadStore store() throws IOException { return new DownloadStore(temporary.newFolder()); }
    private byte[] mp4(int length) {
        byte[] data = new byte[length];
        data[3] = 16; data[4] = 'f'; data[5] = 't'; data[6] = 'y'; data[7] = 'p';
        return data;
    }
    private DownloadStore.Item add(DownloadStore store, String suffix) throws IOException {
        return store.add("https://cdn.sanye.org/" + suffix + ".mp4", "作品 " + suffix);
    }
    @Test public void recoversQueueAndCompletedFileAcrossRestart() throws Exception {
        DownloadStore original = store();
        DownloadStore.Item completed = add(original, "one");
        original.next();
        try (FileOutputStream output = new FileOutputStream(original.file(completed, true))) { output.write(mp4(32)); }
        original.progress(completed, 32, 32, true);
        original.complete(completed);
        DownloadStore.Item interrupted = add(original, "two");
        original.next();
        try (FileOutputStream output = new FileOutputStream(original.file(interrupted, true))) { output.write(new byte[16]); }
        original.progress(interrupted, 16, 100, true);
        DownloadStore restored = new DownloadStore(original.root);
        assertEquals("completed", restored.get(completed.id).state);
        assertEquals(32, restored.playable(completed.id).length());
        assertEquals("queued", restored.get(interrupted.id).state);
        assertEquals(0, restored.get(interrupted.id).bytes);
        assertEquals(interrupted.id, restored.next().id);
        assertFalse(restored.file(interrupted, true).exists());
    }
    @Test public void partialFileIsNotPlayableAndMissingCompletionFailsRecovery() throws Exception {
        DownloadStore store = store();
        DownloadStore.Item item = add(store, "one"); store.next();
        try (FileOutputStream output = new FileOutputStream(store.file(item, true))) { output.write(mp4(32)); }
        store.progress(item, 32, 64, true);
        assertThrows(IOException.class, () -> store.playable(item.id));
        assertThrows(IOException.class, () -> store.complete(item));
        store.progress(item, 32, 32, true); store.complete(item);
        Files.delete(store.playable(item.id).toPath());
        assertEquals("failed", new DownloadStore(store.root).get(item.id).state);
    }
    @Test public void cancellationRetryFailureAndExplicitDeletionKeepUserFilesUntouched() throws Exception {
        DownloadStore store = store();
        File sibling = temporary.newFile("收藏数据库.db");
        DownloadStore.Item item = add(store, "one"); store.next();
        store.cancel(item.id);
        assertThrows(IOException.class, () -> store.progress(item, 12, 32, true));
        assertThrows(IOException.class, () -> store.complete(item));
        store.fail(item, "网络失败"); assertEquals("cancelled", item.state);
        store.retry(item.id); assertEquals("queued", item.state);
        store.next(); store.fail(item, "网络失败");
        assertEquals("failed", new DownloadStore(store.root).get(item.id).state);
        assertThrows(IOException.class, () -> store.delete(item.id, false));
        assertEquals(1, store.list().size()); store.delete(item.id, true);
        assertTrue(store.list().isEmpty()); assertTrue(sibling.exists());
        DownloadStore.Item unsafe = new DownloadStore.Item("../outside", "", "", "failed", 0);
        assertThrows(IOException.class, () -> store.file(unsafe, false));
    }
    @Test public void clearsOnlyCancelledPartialFileOnRestart() throws Exception {
        DownloadStore store = store();
        DownloadStore.Item item = add(store, "one"); store.next();
        try (FileOutputStream output = new FileOutputStream(store.file(item, true))) { output.write(new byte[16]); }
        store.progress(item, 16, 64, true); store.cancel(item.id);
        DownloadStore restored = new DownloadStore(store.root);
        assertEquals("cancelled", restored.get(item.id).state);
        assertEquals(0, restored.get(item.id).bytes);
        assertFalse(restored.file(item, true).exists());
    }
    @Test public void resumesStrongEtagPartialAndTruncatesUnsavedTail() throws Exception {
        DownloadStore store = store(); DownloadStore.Item item = add(store, "resume"); store.next();
        store.metadata(item, "\"version-one\"", 100);
        try (FileOutputStream output = new FileOutputStream(store.file(item, true))) { output.write(mp4(40)); }
        store.progress(item, 32, 100, true);
        DownloadStore restored = new DownloadStore(store.root);
        assertEquals("queued", restored.get(item.id).state);
        assertEquals(32, restored.get(item.id).bytes); assertEquals(32, restored.file(item, true).length());
        DownloadStore.Item resumed = restored.next();
        restored.fail(resumed, "网络失败"); restored.retry(resumed.id);
        assertEquals(32, restored.next().bytes);
        restored.cancel(resumed.id); restored.fail(resumed, "取消");
        assertEquals(32, new DownloadStore(store.root).get(item.id).bytes);
    }
    @Test public void progressSurvivesRestartAndSameSizeCorruptionCannotPlay() throws Exception {
        DownloadStore store = store(); DownloadStore.Item item = add(store, "progress"); store.next();
        try (FileOutputStream output = new FileOutputStream(store.file(item, true))) { output.write(mp4(32)); }
        store.progress(item, 32, 32, true); store.complete(item); store.recordProgress(item.id, 12.5, 100);
        DownloadStore restored = new DownloadStore(store.root);
        assertEquals(12.5, restored.get(item.id).position, 0); assertEquals(100, restored.get(item.id).duration, 0);
        assertThrows(IOException.class, () -> restored.recordProgress(item.id, Double.NaN, 100));
        assertThrows(IOException.class, () -> restored.recordProgress(item.id, 101, 100));
        try (RandomAccessFile output = new RandomAccessFile(restored.playable(item.id), "rw")) { output.seek(30); output.write(5); }
        assertThrows(IOException.class, () -> restored.playable(item.id));
        assertEquals("failed", new DownloadStore(store.root).get(item.id).state);
    }
    @Test public void enforcesTaskStorageAndDuplicateLimits() throws Exception {
        DownloadStore store = store();
        DownloadStore.Item item = add(store, "one");
        assertThrows(IOException.class, () -> add(store, "one"));
        store.next();
        assertThrows(IOException.class, () -> store.checkSpace(item, DownloadStore.MAX_STORAGE_BYTES + 1));
        try (RandomAccessFile file = new RandomAccessFile(store.file(item, true), "rw")) {
            file.setLength(512);
            assertThrows(IOException.class, () -> store.checkSpace(item, DownloadStore.MAX_STORAGE_BYTES - 511));
        }
        for (int position = 1; position < DownloadStore.MAX_TASKS; position++) add(store, "episode" + position);
        assertThrows(IOException.class, () -> add(store, "overflow"));
    }
}
