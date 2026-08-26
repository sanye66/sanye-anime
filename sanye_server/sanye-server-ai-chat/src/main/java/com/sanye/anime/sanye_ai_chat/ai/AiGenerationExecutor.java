package com.sanye.anime.sanye_ai_chat.ai;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;

import java.util.Map;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * AI 生成线程池：核心 4、最大 8、队列 64，拒绝策略为调用方执行（保护模型连接不被丢弃）。
 * 参数可通过 sanye.ai.generation-pool.* 调整。
 */
@Configuration
public class AiGenerationExecutor {

    @Bean(name = "aiGenerationTaskExecutor")
    /** 创建 AI 生成线程池，配置队列、拒绝策略、优雅停机和 MDC 链路透传。 */
    public ThreadPoolTaskExecutor aiGenerationTaskExecutor(
            @Value("${sanye.ai.generation-pool.core-size:4}") int coreSize,
            @Value("${sanye.ai.generation-pool.max-size:8}") int maxSize,
            @Value("${sanye.ai.generation-pool.queue-capacity:64}") int queueCapacity) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(coreSize);
        executor.setMaxPoolSize(maxSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("ai-gen-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // MDC 透传：让异步生成线程继承请求上下文（requestId/用户），保证日志关联与 Feign 头透传
        executor.setTaskDecorator(runnable -> {
            Map<String, String> context = MDC.getCopyOfContextMap();
            return () -> {
                Map<String, String> previous = MDC.getCopyOfContextMap();
                if (context != null) {
                    MDC.setContextMap(context);
                }
                try {
                    runnable.run();
                } finally {
                    if (previous != null) {
                        MDC.setContextMap(previous);
                    } else {
                        MDC.clear();
                    }
                }
            };
        });
        executor.initialize();
        return executor;
    }
}
