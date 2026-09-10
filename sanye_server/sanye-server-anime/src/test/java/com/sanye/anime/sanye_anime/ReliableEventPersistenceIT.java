package com.sanye.anime.sanye_anime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.store.JdbcAnimeCatalogStore;
import com.sanye.anime.sanye_core.event.DomainEvent;
import com.sanye.anime.sanye_core.event.OutboxRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import java.util.concurrent.Executors;
import java.util.concurrent.Callable;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ReliableEventPersistenceIT {
    static JdbcTemplate jdbc;
    static DriverManagerDataSource dataSource;
    static ObjectMapper mapper = new ObjectMapper();

    @BeforeAll
    static void migrateFreshDatabase() {
        String name = System.getenv("SANYE_EVENT_TEST_DATABASE");
        if (name == null || !name.matches("sanye_tr02_[a-z0-9_]+")) throw new IllegalStateException("Explicit fresh test database required");
        dataSource = new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:15432/" + name,
                System.getenv("SANYE_EVENT_TEST_USER"), System.getenv("SANYE_EVENT_TEST_PASSWORD"));
        jdbc = new JdbcTemplate(dataSource);
        assertEquals(0, jdbc.queryForObject("select count(*) from information_schema.schemata where schema_name='sanye_anime'", Integer.class));
        var flyway = Flyway.configure().dataSource(dataSource).schemas("sanye_anime").cleanDisabled(true).load();
        flyway.migrate();
        flyway.validate();
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }

    AnimeManageService service(OutboxRepository outbox) {
        var target = new AnimeManageService(new JdbcAnimeCatalogStore(jdbc, mapper, "sanye_anime"), outbox);
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(dataSource), new AnnotationTransactionAttributeSource()));
        return (AnimeManageService) proxy.getProxy();
    }

    @Test
    void outboxFailureRollsBackBusinessStateAndVersion() {
        var working = service(new OutboxRepository(jdbc, mapper));
        long id = working.create("rollback", "original", "TV", 2026, "fixture", "test", "update").id();
        var failing = service(new OutboxRepository(jdbc, mapper) {
            @Override public void append(DomainEvent event) { throw new IllegalStateException("injected outbox failure"); }
        });
        assertThrows(IllegalStateException.class, () -> failing.updateStatus(id, "已发布"));
        assertEquals("草稿", working.get(id).status());
        assertEquals(0L, jdbc.queryForObject("select version from sanye_anime.sanye_anime where id=?", Long.class, id));
        assertEquals(0, jdbc.queryForObject("select count(*) from sanye_anime.sanye_event_outbox where aggregate_id=?", Integer.class, id));
    }

    @Test
    void concurrentBusinessUpdatesAllocateUniqueVersionsAndPersistSnapshots() throws Exception {
        var working = service(new OutboxRepository(jdbc, mapper));
        long id = working.create("concurrent", "original", "TV", 2026, "fixture", "test", "update").id();
        try (var executor = Executors.newFixedThreadPool(4)) {
            var work = java.util.stream.IntStream.range(0, 12).mapToObj(i -> (Callable<Void>) () -> {
                working.updateStatus(id, i % 2 == 0 ? "已发布" : "已下架"); return null;
            }).toList();
            for (var future : executor.invokeAll(work)) future.get();
        }
        List<Long> versions = jdbc.queryForList("select aggregate_version from sanye_anime.sanye_event_outbox where aggregate_id=? order by aggregate_version", Long.class, id);
        assertEquals(java.util.stream.LongStream.rangeClosed(1, 12).boxed().toList(), versions);
        assertEquals(working.get(id).status(), jdbc.queryForObject("select payload->>'status' from sanye_anime.sanye_event_outbox where aggregate_id=? order by aggregate_version desc limit 1", String.class, id));
        assertEquals(12, jdbc.queryForObject("select count(id) from sanye_anime.sanye_event_outbox where aggregate_id=?", Integer.class, id));
    }

    @Test
    void restartRecoversExpiredLeaseWithoutLosingPersistedMessage() {
        jdbc.update("update sanye_anime.sanye_event_outbox set status='SENT'");
        var repository = new OutboxRepository(jdbc, mapper);
        var working = service(repository);
        long id = working.create("restart", "original", "TV", 2026, "fixture", "test", "update").id();
        working.updateStatus(id, "已发布");
        var first = repository.claim(100).getFirst();
        assertEquals(List.of(), new OutboxRepository(jdbc, mapper).claim(100));
        jdbc.update("update sanye_anime.sanye_event_outbox set next_retry_at=now()-interval '1 second' where event_id=?", first.eventId());
        var recovered = new OutboxRepository(jdbc, mapper).claim(100).getFirst();
        assertEquals(first.eventId(), recovered.eventId());
        repository.markFailed(first.eventId(), 5, true);
        assertTrue(repository.retry(first.eventId()));
        assertFalse(repository.retry(first.eventId()));
    }
}
