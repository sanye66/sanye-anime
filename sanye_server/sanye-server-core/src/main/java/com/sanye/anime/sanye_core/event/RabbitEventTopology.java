package com.sanye.anime.sanye_core.event;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Declares the durable event exchange, search queue and dead-letter route. */
@Configuration
@ConditionalOnProperty(name = "sanye.event.enabled", havingValue = "true")
@EnableScheduling
public class RabbitEventTopology {
    public static final String EXCHANGE = "sanye.events";
    public static final String SEARCH_QUEUE = "sanye.search.events";
    public static final String DEAD_EXCHANGE = "sanye.events.dlx";
    public static final String DEAD_QUEUE = "sanye.events.dead";
    public static final String CACHE_QUEUE = "sanye.anime.cache.events";

    @Bean DirectExchange eventExchange() { return new DirectExchange(EXCHANGE, true, false); }
    @Bean DirectExchange deadExchange() { return new DirectExchange(DEAD_EXCHANGE, true, false); }
    @Bean Queue searchQueue() { return QueueBuilder.durable(SEARCH_QUEUE).deadLetterExchange(DEAD_EXCHANGE).deadLetterRoutingKey("dead").build(); }
    @Bean Queue deadQueue() { return QueueBuilder.durable(DEAD_QUEUE).build(); }
    @Bean Queue cacheQueue() { return QueueBuilder.durable(CACHE_QUEUE).deadLetterExchange(DEAD_EXCHANGE).deadLetterRoutingKey("dead").build(); }
    @Bean Binding cacheBinding(Queue cacheQueue, DirectExchange eventExchange) {
        return BindingBuilder.bind(cacheQueue).to(eventExchange).with("anime.status.changed");
    }
    @Bean Binding searchBinding(Queue searchQueue, DirectExchange eventExchange) {
        return BindingBuilder.bind(searchQueue).to(eventExchange).with("anime.status.changed");
    }
    @Bean Binding deadBinding(Queue deadQueue, DirectExchange deadExchange) {
        return BindingBuilder.bind(deadQueue).to(deadExchange).with("dead");
    }
}
