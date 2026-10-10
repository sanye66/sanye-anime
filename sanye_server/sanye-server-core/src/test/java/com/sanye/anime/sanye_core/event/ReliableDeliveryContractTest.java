package com.sanye.anime.sanye_core.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.time.Instant;
import java.util.List;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class ReliableDeliveryContractTest {
    @Test
    void ackPersistsSentButNackAndReturnedMessagesPersistRetries() {
        for (String result : List.of("ack", "nack", "returned", "exception")) {
            var repository = mock(OutboxRepository.class);
            var rabbit = mock(RabbitTemplate.class);
            when(repository.claim(100)).thenReturn(List.of(new OutboxRepository.OutboxRecord(
                    "broker-event", "anime.status.changed", "1", 1, "{}", Instant.EPOCH, 4)));
            doAnswer(call -> {
                if (result.equals("exception")) throw new IllegalStateException("disconnected");
                CorrelationData correlation = call.getArgument(3);
                if (result.equals("returned")) correlation.setReturned(new ReturnedMessage(
                        new Message(new byte[0], new MessageProperties()), 312, "NO_ROUTE", "sanye.events", "anime.status.changed"));
                correlation.getFuture().complete(new CorrelationData.Confirm(!result.equals("nack"), null));
                return null;
            }).when(rabbit).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
            new RabbitOutboxPublisher(repository, rabbit, new ObjectMapper()).publishPending();
            if (result.equals("ack")) {
                verify(repository).markSent("broker-event");
                verify(repository, never()).markFailed(anyString(), anyInt(), anyBoolean());
            } else {
                verify(repository, never()).markSent(anyString());
                verify(repository).markFailed("broker-event", 5, true);
            }
        }
    }
    @Test
    void mustNotMarkSentBeforeBrokerConfirmation() {
        OutboxRepository repository = mock(OutboxRepository.class);
        RabbitTemplate rabbit = mock(RabbitTemplate.class);
        when(repository.claim(100)).thenReturn(List.of(new OutboxRepository.OutboxRecord(
                "unconfirmed-event", "anime.status.changed", "1", 1,
                "{\"animeId\":1}", Instant.EPOCH, 0)));
        new RabbitOutboxPublisher(repository, rabbit, new ObjectMapper()).publishPending();
        // No broker confirmation has been delivered by this transport.
        verify(repository, never()).markSent("unconfirmed-event");
    }

    @Test
    void rejectedSearchMessageMustRouteToDeadQueue() {
        RabbitEventTopology topology = new RabbitEventTopology();
        var source = topology.searchQueue();
        var binding = topology.deadBinding(topology.deadQueue(), topology.deadExchange());
        String deadRoutingKey = (String) source.getArguments().getOrDefault(
                "x-dead-letter-routing-key", "anime.status.changed");
        assertEquals(binding.getRoutingKey(), deadRoutingKey);
    }
}
