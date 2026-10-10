package com.sanye.anime.sanye_core.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.MessageDeliveryMode;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "sanye.event.publisher-enabled", havingValue = "true")
@ConditionalOnExpression("'${spring.application.name:}' == 'sanye-server-anime'")
public class RabbitOutboxPublisher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RabbitOutboxPublisher.class);
    private final OutboxRepository repository; private final RabbitTemplate rabbit; private final ObjectMapper mapper;
    public RabbitOutboxPublisher(OutboxRepository repository, RabbitTemplate rabbit, ObjectMapper mapper) { this.repository=repository; this.rabbit=rabbit; this.mapper=mapper; }
    @Scheduled(fixedDelayString="${sanye.event.outbox.poll-ms:1000}")
    public void publishPending() {
        for (var row: repository.claim(100)) {
            try {
                var envelope = mapper.createObjectNode()
                        .put("eventId", row.eventId())
                        .put("type", row.type())
                        .put("aggregateId", row.aggregateId())
                        .put("version", row.version())
                        .put("occurredAt", row.occurredAt().toString());
                envelope.set("payload", mapper.readTree(row.payload()));
                MessageProperties properties = new MessageProperties();
                properties.setMessageId(row.eventId());
                properties.setType(row.type());
                properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                CorrelationData correlation = new CorrelationData(row.eventId());
                rabbit.setMandatory(true);
                rabbit.send("sanye.events", row.type(),
                        new Message(mapper.writeValueAsBytes(envelope), properties), correlation);
                var confirmation = correlation.getFuture().get(5, TimeUnit.SECONDS);
                if (!confirmation.isAck() || correlation.getReturned() != null) {
                    throw new IllegalStateException("Broker rejected or returned event");
                }
                repository.markSent(row.eventId());
                log.info("Event confirmed eventId={} aggregateId={} version={} attempts={}", row.eventId(), row.aggregateId(), row.version(), row.attempts());
            }
            catch (Exception e) {
                int attempts=row.attempts()+1;
                repository.markFailed(row.eventId(), attempts, attempts >= 5);
                log.warn("Event publish failed eventId={} attempts={} exhausted={} errorType={}", row.eventId(), attempts, attempts >= 5, e.getClass().getSimpleName());
                if (e instanceof InterruptedException) { Thread.currentThread().interrupt(); return; }
            }
        }
    }
}
