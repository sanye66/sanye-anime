package com.sanye.anime.sanye_anime.monitor;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class EventMetrics {
    public EventMetrics(JdbcTemplate jdbc, MeterRegistry registry) {
        for (String state : new String[] {"PENDING", "SENT", "DEAD"}) {
            Gauge.builder("sanye_event_outbox_records", jdbc, db -> db.queryForObject(
                    "select count(*) from sanye_anime.sanye_event_outbox where status=?", Long.class, state))
                    .tag("state", state).register(registry);
        }
        Gauge.builder("sanye_event_outbox_pending_age_seconds", jdbc, db -> db.queryForObject(
                "select coalesce(extract(epoch from now()-min(occurred_at)),0) from sanye_anime.sanye_event_outbox where status='PENDING'", Double.class))
                .register(registry);
        Gauge.builder("sanye_event_outbox_retry_attempts", jdbc, db -> db.queryForObject(
                "select coalesce(sum(attempts),0) from sanye_anime.sanye_event_outbox", Long.class))
                .register(registry);
    }
}
