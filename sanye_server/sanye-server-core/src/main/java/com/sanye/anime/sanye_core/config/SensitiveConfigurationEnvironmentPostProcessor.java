package com.sanye.anime.sanye_core.config;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** Validates resolved configuration before any infrastructure clients are created. */
public final class SensitiveConfigurationEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    private static final Set<String> ENVIRONMENTS = Set.of("local", "dev", "test", "staging", "prod", "production");
    private static final Set<String> DEFAULTS = Set.of("123456", "password", "guest", "nacos", "sanye",
            "admin", "changeme", "change-me", "replace-me", "sanye-local-jwt-secret-2026");

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Set<String> invalid = new LinkedHashSet<>();
        String deployment = read(environment, "SANYE_ENV", invalid);
        if (deployment.isBlank()) deployment = "test";
        if (!ENVIRONMENTS.contains(deployment)) invalid.add("SANYE_ENV");
        boolean local = "local".equals(deployment);
        if (Arrays.stream(environment.getActiveProfiles()).anyMatch(profile ->
                (local && !"local".equals(profile) && ENVIRONMENTS.contains(profile))
                        || (!local && "local".equals(profile)))) {
            invalid.add("spring.profiles.active");
        }
        // Never let an accidentally exposed diagnostic endpoint reveal configuration values.
        environment.getPropertySources().addFirst(new MapPropertySource("sanyeSensitiveDiagnostics", Map.of(
                "management.endpoint.env.show-values", "never",
                "management.endpoint.configprops.show-values", "never")));
        String service = read(environment, "spring.application.name", invalid);
        if (Set.of("sanye-server-auth", "sanye-server-gateway").contains(service)
                || environment.containsProperty("sanye.auth.token-secret")) {
            if (local) requireText(environment, "sanye.auth.token-secret", invalid);
            else require(environment, "sanye.auth.token-secret", 32, invalid);
        }
        if (!local) {
            if (environment.containsProperty("spring.datasource.url")) {
                require(environment, "spring.datasource.password", 12, invalid);
            }
            if (environment.containsProperty("spring.data.redis.host")
                    || environment.containsProperty("spring.data.redis.url")) {
                require(environment, "spring.data.redis.password", 12, invalid);
            }
            if ("sanye-server-search".equals(service)
                    || enabled(environment, "sanye.event.enabled", invalid)
                    || enabled(environment, "sanye.event.publisher-enabled", invalid)) {
                requireText(environment, "spring.rabbitmq.username", invalid);
                require(environment, "spring.rabbitmq.password", 12, invalid);
            }
            if (Set.of("sanye-server-anime", "sanye-server-search", "sanye-server-ai-chat",
                    "sanye-server-feedback", "sanye-server-job").contains(service)
                    || environment.containsProperty("sanye.manage.internal-token")) {
                require(environment, "sanye.manage.internal-token", 32, invalid);
            }
            for (String component : new String[]{"discovery", "config"}) {
                String prefix = "spring.cloud.nacos." + component;
                if (enabled(environment, prefix + ".enabled", invalid)) {
                    requireText(environment, "spring.cloud.nacos.username", invalid);
                    require(environment, "spring.cloud.nacos.password", 12, invalid);
                    requireText(environment, prefix + ".namespace", invalid);
                }
            }
            if (enabled(environment, "sanye.job.enabled", invalid)) {
                require(environment, "sanye.job.access-token", 12, invalid);
                requireText(environment, "sanye.job.admin-addresses", invalid);
            }
            String provider = read(environment, "sanye.ai.provider", invalid);
            if (!provider.isBlank() && !"dev".equals(provider)) {
                require(environment, "sanye.ai.api-key", 12, invalid);
            }
        }
        if (!invalid.isEmpty()) {
            throw new IllegalStateException("Invalid sensitive configuration: " + String.join(", ", invalid));
        }
    }

    private static boolean enabled(ConfigurableEnvironment environment, String key, Set<String> invalid) {
        return "true".equalsIgnoreCase(read(environment, key, invalid));
    }

    private static void require(ConfigurableEnvironment environment, String key, int minimum, Set<String> invalid) {
        String value = read(environment, key, invalid);
        String lower = value.toLowerCase(Locale.ROOT);
        if (value.length() < minimum || DEFAULTS.contains(lower) || lower.contains("change-me")
                || lower.contains("changeme") || lower.contains("replace-me") || lower.contains("replace_with")
                || lower.contains("change-this") || lower.contains("example") || lower.contains("sanye-dev-")
                || lower.contains("placeholder") || lower.startsWith("your-") || lower.startsWith("your_")
                || lower.contains("local-") || lower.contains("test-only") || value.contains("${")) {
            invalid.add(key);
        }
    }

    private static void requireText(ConfigurableEnvironment environment, String key, Set<String> invalid) {
        if (read(environment, key, invalid).isBlank()) invalid.add(key);
    }

    private static String read(ConfigurableEnvironment environment, String key, Set<String> invalid) {
        try {
            return environment.getProperty(key, "").trim();
        } catch (RuntimeException ignored) {
            // Placeholder resolution exceptions can contain the original secret expression.
            invalid.add(key);
            return "";
        }
    }
}
