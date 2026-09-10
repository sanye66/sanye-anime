package com.sanye.anime.sanye_core.event;

import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class InMemoryEventBusTest {
    @Test void duplicateAndOutOfOrderAreIgnored() {
        InMemoryEventBus bus = new InMemoryEventBus();
        AtomicInteger count = new AtomicInteger();
        bus.subscribe("x", e -> count.incrementAndGet());
        DomainEvent first = DomainEvent.of("x", "a", 2, "v");
        assertEquals(InMemoryEventBus.DeliveryResult.DELIVERED, bus.publish(first));
        assertEquals(InMemoryEventBus.DeliveryResult.DUPLICATE, bus.publish(first));
        assertEquals(InMemoryEventBus.DeliveryResult.STALE, bus.publish(DomainEvent.of("x", "a", 1, "old")));
        assertEquals(1, count.get());
    }
    @Test void retriesThenDeadLetters() {
        InMemoryEventBus bus = new InMemoryEventBus(2);
        AtomicInteger attempts = new AtomicInteger();
        bus.subscribe("x", e -> { attempts.incrementAndGet(); throw new IllegalStateException(); });
        assertEquals(InMemoryEventBus.DeliveryResult.DEAD_LETTER, bus.publish(DomainEvent.of("x", "a", 1, null)));
        assertEquals(3, attempts.get());
        assertEquals(1, bus.deadLetters().size());
    }
}
