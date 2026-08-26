package com.sanye.anime.sanye_anime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeCard;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.HomeResponse;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.HomeSection;
import com.sanye.anime.sanye_anime.cache.HomeCache;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HomeAggregationServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HomeMetrics homeMetrics = new HomeMetrics(new SimpleMeterRegistry());

    private static HomeResponse sample() {
        return new HomeResponse(List.of(), List.of(new HomeSection("recent", "最近更新",
                List.of(new AnimeCard(1, "星海回声", "城市回声", "原创动画", 2025, 9.2,
                        "已发布", "/covers/anime-1.svg", List.of("科幻"), "周三更新")))), List.of());
    }

    @Test
    void cacheHitSkipsLoader() {
        FakeCache cache = new FakeCache();
        HomeAggregationService service = new HomeAggregationService(cache, objectMapper, homeMetrics, 300, 30);
        AtomicInteger loads = new AtomicInteger();

        service.home("FEATURED", () -> {
            loads.incrementAndGet();
            return sample();
        });
        service.home("FEATURED", () -> {
            loads.incrementAndGet();
            return sample();
        });

        assertEquals(1, loads.get(), "缓存命中后不应再次回源");
        assertTrue(cache.containsKey("home:FEATURED"));
    }

    @Test
    void concurrentMissLoadsOnce() throws Exception {
        FakeCache cache = new FakeCache();
        HomeAggregationService service = new HomeAggregationService(cache, objectMapper, homeMetrics, 300, 30);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger loads = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(8);

        var futures = java.util.stream.IntStream.range(0, 8).mapToObj(i -> pool.submit(() ->
                service.home("FEATURED", () -> {
                    loads.incrementAndGet();
                    started.countDown();
                    try {
                        release.await();
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                    }
                    return sample();
                }))).toList();

        assertTrue(started.await(5, TimeUnit.SECONDS));
        release.countDown();
        for (var future : futures) {
            future.get(10, TimeUnit.SECONDS);
        }
        pool.shutdown();

        assertEquals(1, loads.get(), "并发未命中时只允许一次回源（单飞）");
    }

    @Test
    void emptyResultCachedWithShortTtl() {
        FakeCache cache = new FakeCache();
        HomeAggregationService service = new HomeAggregationService(cache, objectMapper, homeMetrics, 300, 30);
        HomeResponse empty = new HomeResponse(List.of(), List.of(), List.of());

        service.home("FEATURED", () -> empty);

        assertTrue(cache.containsKey("home:FEATURED"), "空结果也缓存（穿透防护）");
        assertEquals(Duration.ofSeconds(30), cache.ttlOf("home:FEATURED"));
    }

    @Test
    void invalidateRemovesEntry() {
        FakeCache cache = new FakeCache();
        HomeAggregationService service = new HomeAggregationService(cache, objectMapper, homeMetrics, 300, 30);
        service.home("FEATURED", HomeAggregationServiceTest::sample);
        service.invalidate("FEATURED");
        assertFalse(cache.containsKey("home:FEATURED"));
    }

    private static final class FakeCache implements HomeCache {

        private final ConcurrentHashMap<String, Cached> store = new ConcurrentHashMap<>();

        @Override
        public Optional<String> get(String key) {
            Cached cached = store.get(key);
            return cached == null ? Optional.empty() : Optional.of(cached.json());
        }

        @Override
        public void put(String key, String json, Duration ttl) {
            store.put(key, new Cached(json, ttl));
        }

        @Override
        public void delete(String key) {
            store.remove(key);
        }

        boolean containsKey(String key) {
            return store.containsKey(key);
        }

        Duration ttlOf(String key) {
            Cached cached = store.get(key);
            return cached == null ? null : cached.ttl();
        }
    }

    private record Cached(String json, Duration ttl) {
    }
}
