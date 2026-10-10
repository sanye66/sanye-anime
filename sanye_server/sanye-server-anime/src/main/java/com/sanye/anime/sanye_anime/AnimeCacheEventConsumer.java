package com.sanye.anime.sanye_anime;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.data.redis.core.ScanOptions;

@Component
@ConditionalOnProperty(name = "sanye.event.enabled", havingValue = "true")
public class AnimeCacheEventConsumer {
    private final StringRedisTemplate redis;
    public AnimeCacheEventConsumer(StringRedisTemplate redis) { this.redis = redis; }

    @RabbitListener(queues = "sanye.anime.cache.events")
    public void invalidate(byte[] event) {
        // Redis failures must reach the retry/DLX policy; do not swallow deletion failures.
        try (var keys = redis.scan(ScanOptions.scanOptions().match("sanye:home:home:*").count(100).build())) {
            while (keys.hasNext()) redis.delete(keys.next());
        }
    }
}
