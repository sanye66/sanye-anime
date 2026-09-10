package com.sanye.anime.sanye_core.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

@Repository
@ConditionalOnProperty(name = "spring.application.name", havingValue = "sanye-server-anime")
public class OutboxRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public OutboxRepository(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }
    public void append(DomainEvent event) {
        requireTransaction();
        try { jdbc.update("insert into sanye_anime.sanye_event_outbox(event_id,event_type,aggregate_id,aggregate_version,payload,occurred_at,status,attempts,next_retry_at) values (?,?,?,?,?::jsonb,?,'PENDING',0,?) on conflict (event_id) do nothing",
                event.eventId(), event.type(), Long.parseLong(event.aggregateId()), event.version(), mapper.writeValueAsString(event.payload()), Timestamp.from(event.occurredAt()), Timestamp.from(event.occurredAt())); }
        catch (JsonProcessingException e) { throw new IllegalArgumentException("event payload is not JSON", e); }
    }
    public long nextVersion(String aggregateId) {
        requireTransaction();
        return jdbc.queryForObject("update sanye_anime.sanye_anime a set version=greatest(a.version, coalesce((select max(aggregate_version) from sanye_anime.sanye_event_outbox where aggregate_id=a.id),0))+1 where id=? returning version", Long.class, Long.parseLong(aggregateId));
    }
    public void lockAggregate(long id) {
        requireTransaction();
        jdbc.queryForList("select id from sanye_anime.sanye_anime where id=? for update", id);
    }
    private void requireTransaction() {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Outbox writes require a business transaction");
        }
    }
    public List<OutboxRecord> claim(int limit) {
        return jdbc.query("update sanye_anime.sanye_event_outbox set next_retry_at=now()+interval '30 seconds' where id in (select id from sanye_anime.sanye_event_outbox where status='PENDING' and next_retry_at<=now() order by occurred_at for update skip locked limit ?) returning event_id,event_type,aggregate_id,aggregate_version,payload,occurred_at,attempts", (rs,n) -> new OutboxRecord(rs.getString(1),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getString(5),rs.getTimestamp(6).toInstant(),rs.getInt(7)), Math.min(limit, 1));
    }
    public void markSent(String id) { jdbc.update("update sanye_anime.sanye_event_outbox set status='SENT', sent_at=now() where event_id=?", id); }
    public void markFailed(String id, int attempts, boolean dead) { jdbc.update("update sanye_anime.sanye_event_outbox set attempts=?, status=?, next_retry_at=now() + (? || ' seconds')::interval, last_error=? where event_id=?", attempts, dead ? "DEAD" : "PENDING", Math.min(3600, 1L << Math.min(attempts, 10)), "publish failed", id); }
    public boolean retry(String eventId) {
        return jdbc.update("update sanye_anime.sanye_event_outbox set status='PENDING',attempts=0,next_retry_at=now(),last_error=null where event_id=? and status='DEAD'", eventId) == 1;
    }
    public record OutboxRecord(String eventId,String type,String aggregateId,long version,String payload,Instant occurredAt,int attempts) {}
}
