package com.sanye.anime.sanye_core.event;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Deterministic reliable bus used locally and as the reference broker adapter contract. */
public final class InMemoryEventBus {
    private final Map<String, List<EventHandler>> handlers = new ConcurrentHashMap<>();
    private final Set<String> processed = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> versions = new ConcurrentHashMap<>();
    private final List<DomainEvent> deadLetters = new CopyOnWriteArrayList<>();
    private final int maxRetries;

    public InMemoryEventBus() { this(3); }
    public InMemoryEventBus(int maxRetries) {
        if (maxRetries < 0) throw new IllegalArgumentException("maxRetries must be non-negative");
        this.maxRetries = maxRetries;
    }
    public void subscribe(String type, EventHandler handler) {
        handlers.computeIfAbsent(type, k -> new CopyOnWriteArrayList<>()).add(handler);
    }
    public DeliveryResult publish(DomainEvent event) {
        if (!processed.add(event.eventId())) return DeliveryResult.DUPLICATE;
        String key = event.type() + ":" + event.aggregateId();
        long previous = versions.getOrDefault(key, 0L);
        if (event.version() <= previous) return DeliveryResult.STALE;
        List<EventHandler> consumers = handlers.getOrDefault(event.type(), List.of());
        try {
            for (EventHandler handler : consumers) {
                int attempts = 0;
                while (true) {
                    try { handler.handle(event); break; }
                    catch (Exception ex) {
                        if (attempts++ >= maxRetries) { deadLetters.add(event); return DeliveryResult.DEAD_LETTER; }
                    }
                }
            }
            versions.put(key, event.version());
            return DeliveryResult.DELIVERED;
        } catch (RuntimeException ex) {
            deadLetters.add(event);
            return DeliveryResult.DEAD_LETTER;
        }
    }
    public List<DomainEvent> deadLetters() { return List.copyOf(deadLetters); }
    public enum DeliveryResult { DELIVERED, DUPLICATE, STALE, DEAD_LETTER }
}
