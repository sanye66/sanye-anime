package com.sanye.anime.sanye_core.event;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Reliable event envelope shared by in-process and broker adapters. */
public record DomainEvent(String eventId, String type, String aggregateId, long version,
                          Object payload, Instant occurredAt) {
    public DomainEvent {
        eventId = Objects.requireNonNullElseGet(eventId, () -> UUID.randomUUID().toString());
        type = Objects.requireNonNull(type, "type");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        if (version < 1) throw new IllegalArgumentException("version must be positive");
        occurredAt = Objects.requireNonNullElseGet(occurredAt, Instant::now);
    }
    public static DomainEvent of(String type, String aggregateId, long version, Object payload) {
        return new DomainEvent(null, type, aggregateId, version, payload, null);
    }
}
