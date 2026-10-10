package com.sanye.anime.sanye_search;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sanye.anime.sanye_search.model.SearchDoc;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.util.Set;

@Component
public class SearchEventConsumer {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SearchEventConsumer.class);
    private final AnimeIndexService index;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;

    public SearchEventConsumer(AnimeIndexService index, ObjectMapper mapper, JdbcTemplate jdbc) {
        this.index = index;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @RabbitListener(queues = "${sanye.event.queue:sanye.search.events}")
    @Transactional(rollbackFor = Exception.class)
    public void consume(byte[] body) throws IOException {
        JsonNode event = mapper.readTree(body);
        if (event == null || !event.isObject()) throw new IllegalArgumentException("invalid event");
        JsonNode payload = event.path("payload");
        String eventId = event.path("eventId").asText("");
        long id = payload.path("animeId").asLong(0);
        long version = event.path("version").asLong(0);
        if (eventId.isBlank() || eventId.length() > 128
                || !"anime.status.changed".equals(event.path("type").asText())
                || id <= 0 || !String.valueOf(id).equals(event.path("aggregateId").asText())
                || version <= 0 || !payload.isObject()
                || !payload.path("animeId").isIntegralNumber() || !event.path("version").isIntegralNumber()
                || !payload.path("animeId").canConvertToLong() || !event.path("version").canConvertToLong()
                || !payload.path("id").isIntegralNumber() || payload.path("id").asLong() != id
                || !Set.of("草稿", "待审核", "已发布", "已下架").contains(payload.path("status").asText())) {
            throw new IllegalArgumentException("invalid anime event envelope");
        }
        // Hold a shared transaction lock through inbox commit; rebuild takes the exclusive lock.
        jdbc.execute("select pg_advisory_xact_lock_shared(731903)");
        // The placeholder serializes concurrent first deliveries before any ES operation.
        jdbc.update("insert into sanye_search.sanye_search_event_inbox(aggregate_id,version,event_id) values (?,?,?) on conflict (aggregate_id) do nothing", id, 0L, "initial");
        Long current = jdbc.query("select version from sanye_search.sanye_search_event_inbox where aggregate_id=? for update", rs -> rs.next() ? rs.getLong(1) : null, id);
        if (current == null) throw new IllegalStateException("missing inbox lock row");
        if (version <= current) {
            log.info("Event skipped eventId={} aggregateId={} version={} current={}", eventId, id, version, current);
            return;
        }
        if (!"已发布".equals(payload.path("status").asText())) {
            index.delete(id);
        } else {
            ObjectNode document = payload.deepCopy();
            document.remove("animeId");
            index.upsert(mapper.treeToValue(document, SearchDoc.class));
        }
        jdbc.update("update sanye_search.sanye_search_event_inbox set version=?,event_id=?,processed_at=now() where aggregate_id=?", version, eventId, id);
        log.info("Event applied eventId={} aggregateId={} version={}", eventId, id, version);
    }
}
