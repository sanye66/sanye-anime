package com.sanye.anime.sanye_ai_chat.monitor;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * AI 生成线程池指标（T-G-05，与监控方案 3.1 节对齐）：
 * 队列大小/活跃线程/池大小 + 拒绝计数（CallerRuns 策略下通常为 0，告警 >0 时关注）。
 */
@Component
public class ThreadPoolMetrics {

    /** 注册 AI 线程池的队列、活跃线程、池大小和拒绝任务指标。 */
    public ThreadPoolMetrics(MeterRegistry registry,
                             @Qualifier("aiGenerationTaskExecutor") ThreadPoolTaskExecutor executor) {
        Gauge.builder("sanye_threadpool_queue_size", executor,
                        e -> e.getThreadPoolExecutor().getQueue().size())
                .tag("pool", "ai-gen")
                .description("AI 生成线程池队列大小")
                .register(registry);
        Gauge.builder("sanye_threadpool_active_threads", executor,
                        ThreadPoolTaskExecutor::getActiveCount)
                .tag("pool", "ai-gen")
                .description("AI 生成线程池活跃线程数")
                .register(registry);
        Gauge.builder("sanye_threadpool_pool_size", executor,
                        e -> e.getThreadPoolExecutor().getPoolSize())
                .tag("pool", "ai-gen")
                .description("AI 生成线程池大小")
                .register(registry);
        Counter.builder("sanye_threadpool_rejected_total")
                .tag("pool", "ai-gen")
                .description("AI 生成任务拒绝数（CallerRuns 下通常为 0）")
                .register(registry);
    }
}
