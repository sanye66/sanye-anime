package com.sanye.sanye_anime;

import org.junit.Test;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class SearchSchedulingTest {
    @Test public void newKeywordCancelsRunningAndQueuedOldSearches() throws Exception {
        var scheduler = new SanyeSourcePlugin.SearchScheduler();
        var started = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        var cancelled = new AtomicInteger();
        var staleRuns = new AtomicInteger();
        try {
            Runnable slow = () -> { started.countDown(); try { release.await(); } catch (InterruptedException expected) { Thread.currentThread().interrupt(); } };
            scheduler.submit(false, "interactive", "旧词", slow, cancelled::incrementAndGet);
            scheduler.submit(false, "interactive", "旧词", slow, cancelled::incrementAndGet);
            assertTrue(started.await(1, TimeUnit.SECONDS));
            scheduler.submit(false, "interactive", "旧词", staleRuns::incrementAndGet, cancelled::incrementAndGet);
            var fresh = new CountDownLatch(1);
            scheduler.submit(false, "interactive", "新词", fresh::countDown, () -> {});
            assertTrue("新搜索不应等待旧任务", fresh.await(1, TimeUnit.SECONDS));
            assertEquals(3, cancelled.get()); assertEquals(0, staleRuns.get());
        } finally { release.countDown(); scheduler.shutdown(); }
    }

    @Test public void interactiveCancelsBackgroundButSameKeywordSubscriptionsCoexist() throws Exception {
        var scheduler = new SanyeSourcePlugin.SearchScheduler();
        var backgroundStarted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var cancelled = new AtomicInteger();
        try {
            scheduler.submit(true, "repository", "热门", () -> {
                backgroundStarted.countDown(); try { release.await(); } catch (InterruptedException expected) { Thread.currentThread().interrupt(); }
            }, cancelled::incrementAndGet);
            assertTrue(backgroundStarted.await(1, TimeUnit.SECONDS));
            var foreground = new CountDownLatch(2);
            var foregroundCancelled = new AtomicInteger();
            scheduler.submit(false, "interactive", "作品", foreground::countDown, foregroundCancelled::incrementAndGet);
            scheduler.submit(false, "interactive", "作品", foreground::countDown, foregroundCancelled::incrementAndGet);
            assertTrue(foreground.await(1, TimeUnit.SECONDS));
            assertEquals("同词订阅不应相互取消", 0, foregroundCancelled.get());
            assertEquals(1, cancelled.get());
        } finally { release.countDown(); scheduler.shutdown(); }
    }

    @Test public void losingPublicSearchEntryIsInterruptedAfterFirstHit() throws Exception {
        var plugin = new SanyeSourcePlugin();
        var slowStarted = new CountDownLatch(1);
        var interrupted = new CountDownLatch(1);
        try {
            var hit = new SanyeSourcePlugin.SearchHit("作品", "https://www.yhdmtv.cc/p/1", "", "");
            var result = plugin.raceSearch(System.nanoTime() + TimeUnit.SECONDS.toNanos(2), List.of(
                () -> { slowStarted.countDown(); try { new CountDownLatch(1).await(); } catch (InterruptedException expected) { interrupted.countDown(); throw expected; } return List.of(); },
                () -> { assertTrue(slowStarted.await(1, TimeUnit.SECONDS)); return List.of(hit); }));
            assertEquals(List.of(hit), result.hits());
            assertTrue("败方不应继续占用竞速池", interrupted.await(1, TimeUnit.SECONDS));
        } finally { plugin.handleOnDestroy(); }
    }
}
