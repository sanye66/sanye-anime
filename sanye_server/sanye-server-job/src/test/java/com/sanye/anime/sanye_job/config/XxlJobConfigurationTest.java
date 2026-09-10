package com.sanye.anime.sanye_job.config;

import com.xxl.job.core.executor.impl.XxlJobSpringExecutor;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.junit.jupiter.api.Assertions.*;
import static org.assertj.core.api.Assertions.assertThat;

class XxlJobConfigurationTest {
    @Test
    void disabledByDefault() {
        new ApplicationContextRunner().withUserConfiguration(XxlJobConfiguration.class)
                .run(context -> assertThat(context).doesNotHaveBean(XxlJobSpringExecutor.class));
    }

    @Test
    void rejectsEnabledExecutorWithoutCredentials() {
        new ApplicationContextRunner().withUserConfiguration(XxlJobConfiguration.class)
                .withPropertyValues("sanye.job.enabled=true", "sanye.job.admin-addresses=http://localhost:18080")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void constructsExecutorAndValidatesSettingsBeforeOpeningPorts() {
        XxlJobConfiguration config = new XxlJobConfiguration();
        assertNotNull(config.xxlJobExecutor("http://localhost:18080", "test-token", "sanye_job",
                "", "", 9999, "./logs/xxl-job", 30, "test-internal"));
        assertThrows(IllegalArgumentException.class, () -> config.xxlJobExecutor("http://localhost:18080",
                "test-token", "sanye_job", "", "", 0, "./logs/xxl-job", 30, "test-internal"));
        assertThrows(IllegalArgumentException.class, () -> config.xxlJobExecutor("http://localhost:18080",
                "test-token", "sanye_job", "", "", 9999, "./logs/xxl-job", 2, "test-internal"));
        assertThrows(IllegalArgumentException.class, () -> config.xxlJobExecutor("http://localhost:18080",
                "test-token", "sanye_job", "", "", 9999, "./logs/xxl-job", 30, ""));
    }
}
