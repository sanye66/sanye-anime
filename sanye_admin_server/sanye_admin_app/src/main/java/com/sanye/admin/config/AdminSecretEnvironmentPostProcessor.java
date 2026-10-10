package com.sanye.admin.config;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** Validates resolved configuration before connections or application beans are created. */
public final class AdminSecretEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    @Override
    public int getOrder() { return Ordered.LOWEST_PRECEDENCE; }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication application) {
        try {
            validate(env);
        } catch (RuntimeException failure) {
            String message = failure.getMessage();
            if (message != null && message.startsWith("Sensitive configuration rejected: ")) {
                throw new IllegalStateException(message);
            }
            throw new IllegalStateException("Sensitive configuration rejected: invalid configuration value");
        }
    }

    private static void validate(ConfigurableEnvironment env) {
        String mode = env.getProperty("SANYE_ENV", "test");
        if (!Set.of("local", "dev", "test", "staging", "prod", "production").contains(mode)) {
            fail("SANYE_ENV");
        }
        env.getPropertySources().addFirst(new MapPropertySource("sanyeSensitiveDiagnostics", Map.of(
                "management.endpoint.env.show-values", "never", "management.endpoint.configprops.show-values", "never")));
        if ("local".equals(mode)) {
            if (Arrays.stream(env.getActiveProfiles()).anyMatch(p -> Set.of("dev", "test", "staging", "prod", "production").contains(p))) {
                fail("SANYE_ENV/profile");
            }
            if (env.getProperty("token.secret", "").isBlank()) fail("token.secret");
            return;
        }
        if (Arrays.asList(env.getActiveProfiles()).contains("local")) fail("SANYE_ENV/profile");
        require(env, "token.secret", 32);
        require(env, "sanye-admin.manage-token", 32);
        require(env, "spring.datasource.druid.master.password", 12);
        require(env, "spring.data.redis.password", 12);
        if (env.getProperty("spring.datasource.druid.slave.enabled", Boolean.class, false)) {
            require(env, "spring.datasource.druid.slave.password", 12);
        }
        if (env.getProperty("spring.datasource.druid.stat-view-servlet.enabled", Boolean.class, false)) {
            require(env, "spring.datasource.druid.stat-view-servlet.login-password", 12);
        }
        if (!env.getProperty("sanye-admin.xxl-job.url", "").isBlank()) {
            require(env, "sanye-admin.xxl-job.username", 1);
            require(env, "sanye-admin.xxl-job.password", 12);
        }
        String level = env.getProperty("logging.level.com.sanye.admin", "info");
        if (Set.of("trace", "debug").contains(level.toLowerCase(Locale.ROOT))) fail("logging.level.com.sanye.admin");
        if (env.getProperty("spring.devtools.restart.enabled", Boolean.class, false)) fail("spring.devtools.restart.enabled");
    }

    private static void require(ConfigurableEnvironment env, String key, int length) {
        String value;
        try { value = env.getProperty(key); }
        catch (RuntimeException ignored) { fail(key); return; }
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() < length || normalized.contains("${")
                || normalized.matches(".*(change.?me|change.?this|replace|placeholder|example|local.only|sanye.local|sanye.dev).*")) {
            fail(key);
        }
    }

    private static void fail(String key) {
        throw new IllegalStateException("Sensitive configuration rejected: " + key);
    }
}
