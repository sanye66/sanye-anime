package com.sanye.anime.sanye_search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sanye.anime.sanye_search.model.SearchDoc;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SearchEventConsumerTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AnimeIndexService index = mock(AnimeIndexService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final SearchEventConsumer consumer = new SearchEventConsumer(index, mapper, jdbc);

    @BeforeEach
    void unlockedVersion() {
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(42L))).thenReturn(0L);
    }

    private ObjectNode event(long version, String status) {
        ObjectNode event = mapper.createObjectNode();
        event.put("eventId", "event-" + version).put("type", "anime.status.changed")
                .put("aggregateId", "42").put("version", version);
        ObjectNode payload = mapper.valueToTree(new SearchDoc(42, "title", "original", "TV", 2026,
                8.0, status, "/cover.png", List.of("tag"), "update", "summary"));
        payload.put("animeId", 42);
        event.set("payload", payload);
        return event;
    }

    private void consume(ObjectNode event) throws IOException {
        consumer.consume(mapper.writeValueAsBytes(event));
    }

    @Test
    void publishedEnvelopeMapsWithoutLeakingAnimeIdAndRecordsVersionAfterIndex() throws Exception {
        consume(event(1, "已发布"));
        var order = inOrder(jdbc, index);
        order.verify(jdbc).update(startsWith("insert into sanye_search."), eq(42L), eq(0L), eq("initial"));
        order.verify(jdbc).query(contains("for update"), any(ResultSetExtractor.class), eq(42L));
        order.verify(index).upsert(argThat(doc -> doc.id() == 42 && "title".equals(doc.title())));
        order.verify(jdbc).update(startsWith("update sanye_search."), eq(1L), eq("event-1"), eq(42L));
    }

    @Test
    void everyUnpublishedStateDeletesAndPersistsTombstone() throws Exception {
        for (String status : List.of("草稿", "待审核", "已下架")) consume(event(2, status));
        verify(index, times(3)).delete(42);
        verify(index, never()).upsert(any());
        verify(jdbc, times(3)).update(startsWith("update sanye_search."), eq(2L), eq("event-2"), eq(42L));
    }

    @Test
    void duplicateAndOlderVersionsDoNotRestoreDeletedDocument() throws Exception {
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(42L))).thenReturn(3_000_000_000L);
        consume(event(3_000_000_000L, "已发布"));
        consume(event(2_999_999_999L, "已发布"));
        verifyNoInteractions(index);
        verify(jdbc, never()).update(startsWith("update sanye_search."), any(), any(), any());
    }

    @Test
    void elasticFailureDoesNotAdvanceVersionAndRedeliveryRetries() throws Exception {
        doThrow(new IOException("ES unavailable")).doNothing().when(index).delete(42);
        assertThrows(IOException.class, () -> consume(event(4, "已下架")));
        verify(jdbc, never()).update(startsWith("update sanye_search."), any(), any(), any());
        consume(event(4, "已下架"));
        verify(index, times(2)).delete(42);
        verify(jdbc).update(startsWith("update sanye_search."), eq(4L), eq("event-4"), eq(42L));
    }

    @Test
    void checkedElasticFailureRollsBackThroughSpringTransactionProxy() throws Exception {
        PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        TransactionStatus transaction = mock(TransactionStatus.class);
        when(transactions.getTransaction(any())).thenReturn(transaction);
        ProxyFactory factory = new ProxyFactory(consumer);
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        SearchEventConsumer proxy = (SearchEventConsumer) factory.getProxy();
        doThrow(new IOException("ES unavailable")).when(index).delete(42);
        assertThrows(IOException.class, () -> proxy.consume(mapper.writeValueAsBytes(event(4, "已下架"))));
        verify(transactions).rollback(transaction);
        verify(transactions, never()).commit(any());
    }

    @Test
    void malformedEnvelopeNeverTouchesDatabaseOrIndex() {
        for (String field : List.of("eventId", "type", "aggregateId", "version", "payload")) {
            ObjectNode invalid = event(1, "已发布");
            invalid.remove(field);
            assertThrows(IllegalArgumentException.class, () -> consume(invalid));
        }
        ObjectNode mismatch = event(1, "已发布");
        ((ObjectNode) mismatch.get("payload")).put("id", 43);
        assertThrows(IllegalArgumentException.class, () -> consume(mismatch));
        assertThrows(IllegalArgumentException.class, () -> consume(event(1, "unknown")));
        verifyNoInteractions(index, jdbc);
    }
}
