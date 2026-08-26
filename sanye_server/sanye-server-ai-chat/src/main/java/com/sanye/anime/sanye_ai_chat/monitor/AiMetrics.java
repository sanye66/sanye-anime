package com.sanye.anime.sanye_ai_chat.monitor;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

/**
 * AI 业务指标（T-G-03 第一批，与监控方案 3.2 节对齐）：
 * 完成/失败/拒答计数与首字耗时，经 /actuator/prometheus 暴露。
 */
@Component
public class AiMetrics {

    private final Counter completed;
    private final Counter failed;
    private final Counter refused;
    private final Timer firstToken;

    /** 在监控注册表中创建 AI 完成、失败、拒答和首字耗时指标。 */
    public AiMetrics(MeterRegistry registry) {
        this.completed = Counter.builder("sanye_ai_completed_total")
                .description("AI 回答完成数").register(registry);
        this.failed = Counter.builder("sanye_ai_failed_total")
                .description("AI 回答失败数").register(registry);
        this.refused = Counter.builder("sanye_ai_refused_total")
                .description("安全拒答数").register(registry);
        this.firstToken = Timer.builder("sanye_ai_first_token_seconds")
                .description("AI 首字耗时").publishPercentileHistogram().register(registry);
    }

    /** 记录回答完成次数。 */
    public void completed() {
        completed.increment();
    }

    /** 记录回答失败次数。 */
    public void failed() {
        failed.increment();
    }

    /** 记录安全拒答次数。 */
    public void refused() {
        refused.increment();
    }

    /** 开始首 token 计时。 */
    public Timer.Sample startFirstToken() {
        return Timer.start();
    }

    /** 结束首 token 计时并写入监控指标。 */
    public void firstToken(Timer.Sample sample) {
        sample.stop(firstToken);
    }
}
