package com.sanye.admin.config;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class DeploymentMonitoringConfigurationTest {
    private final Path repository = repositoryRoot();

    @Test
    void feedbackAndJobScrapesMatchTheirActualHttpPorts() throws IOException {
        var configuration = load("sanye_deploy/monitoring/prometheus.yml");
        var jobs = maps(configuration.get("scrape_configs")).stream()
                .collect(Collectors.toMap(job -> job.get("job_name").toString(), job -> job));
        for (String service : List.of("feedback", "job")) {
            var application = load("sanye_server/sanye-server-" + service + "/src/main/resources/application.yml");
            var port = ((Map<?, ?>) application.get("server")).get("port");
            var job = jobs.get("sanye-" + service);
            assertNotNull(job, service);
            assertEquals("/actuator/prometheus", job.get("metrics_path"));
            assertEquals(List.of("host.docker.internal:" + port), maps(job.get("static_configs")).getFirst().get("targets"));
            var spring = (Map<?, ?>) application.get("spring");
            assertTrue(((Map<?, ?>) spring.get("config")).get("import").toString().contains("classpath:monitoring.yml"));
        }
        assertEquals(List.of("prometheus-rules.yml"), configuration.get("rule_files"));
    }

    @Test
    void alertsUseExportedEventMetricsAndPreservePerInstanceAndLowTrafficSignals() throws IOException {
        var rules = maps(load("sanye_deploy/monitoring/prometheus-rules.yml").get("groups")).stream()
                .flatMap(group -> maps(group.get("rules")).stream())
                .collect(Collectors.toMap(rule -> rule.get("alert").toString(), rule -> rule));
        var eventSource = Files.readString(repository.resolve("sanye_server/sanye-server-anime/src/main/java/com/sanye/anime/sanye_anime/monitor/EventMetrics.java"));
        assertTrue(eventSource.contains("sanye_event_outbox_pending_age_seconds"));
        assertTrue(eventSource.contains("sanye_event_outbox_records"));
        assertEquals("sanye_event_outbox_pending_age_seconds > 300", rules.get("SanyeOutboxPendingAgeHigh").get("expr"));
        assertEquals("sanye_event_outbox_records{state=\"DEAD\"} > 0", rules.get("SanyeOutboxDeadRecords").get("expr"));
        var heap = rules.get("SanyeJvmHeapHigh").get("expr").toString();
        assertEquals(2, heap.split("sum by \\(job, instance\\)", -1).length - 1);
        var home = rules.get("SanyeHomeErrorRateHigh").get("expr").toString();
        assertFalse(home.contains("clamp_min"));
        assertTrue(home.contains("and (rate(sanye_home_request_total[5m]) > 0)"));
    }

    private Map<String, Object> load(String relativePath) throws IOException {
        try (var reader = Files.newBufferedReader(repository.resolve(relativePath))) {
            return new Yaml().load(reader);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }

    private static Path repositoryRoot() {
        var directory = Path.of("").toAbsolutePath();
        for (int depth = 0; depth < 4 && directory != null; depth++, directory = directory.getParent()) {
            if (Files.isRegularFile(directory.resolve("sanye_deploy/monitoring/prometheus.yml"))) return directory;
        }
        throw new IllegalStateException("未找到当前仓库监控配置");
    }
}
