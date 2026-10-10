package com.sanye.admin.config;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class AdminSecretEnvironmentPostProcessorTest {
    private final AdminSecretEnvironmentPostProcessor guard = new AdminSecretEnvironmentPostProcessor();

    private MockEnvironment valid() {
        MockEnvironment env = new MockEnvironment();
        for (String key : new String[] {"token.secret", "sanye-admin.manage-token",
                "spring.datasource.druid.master.password", "spring.data.redis.password"}) {
            env.setProperty(key, UUID.randomUUID().toString());
        }
        return env;
    }

    @Test void missingAndPlaceholderCredentialsAreRejectedWithoutValues() {
        for (String key : new String[] {"token.secret", "sanye-admin.manage-token",
                "spring.datasource.druid.master.password", "spring.data.redis.password"}) {
            for (String value : new String[] {"", "123456", "change-this-secret-in-environment", "${UNRESOLVED_SECRET}"}) {
                MockEnvironment env = valid().withProperty(key, value);
                IllegalStateException failure = assertThrows(IllegalStateException.class,
                        () -> guard.postProcessEnvironment(env, null));
                assertEquals("Sensitive configuration rejected: " + key, failure.getMessage());
                assertNull(failure.getCause());
            }
        }
    }

    @Test void injectedCredentialsPassAndOptionalIntegrationsAreConditional() {
        MockEnvironment env = valid();
        assertDoesNotThrow(() -> guard.postProcessEnvironment(env, null));
        env.setProperty("sanye-admin.xxl-job.url", "http://127.0.0.1:8080");
        assertThrows(IllegalStateException.class, () -> guard.postProcessEnvironment(env, null));
        env.setProperty("sanye-admin.xxl-job.username", "operator");
        env.setProperty("sanye-admin.xxl-job.password", UUID.randomUUID().toString());
        assertDoesNotThrow(() -> guard.postProcessEnvironment(env, null));
        env.setProperty("spring.datasource.druid.slave.enabled", "true");
        assertThrows(IllegalStateException.class, () -> guard.postProcessEnvironment(env, null));
    }

    @Test void localModeCannotBeCombinedWithDeploymentProfile() {
        MockEnvironment env = new MockEnvironment().withProperty("SANYE_ENV", "local");
        assertThrows(IllegalStateException.class, () -> guard.postProcessEnvironment(env, null));
        env.setProperty("token.secret", UUID.randomUUID().toString());
        assertDoesNotThrow(() -> guard.postProcessEnvironment(env, null));
        env.setActiveProfiles("druid", "prod");
        assertThrows(IllegalStateException.class, () -> guard.postProcessEnvironment(env, null));
        assertThrows(IllegalStateException.class,
                () -> guard.postProcessEnvironment(valid().withProperty("SANYE_ENV", "typo"), null));
    }

    @Test void diagnosticsMustBeSafeOutsideLocalMode() {
        for (Map.Entry<String, String> entry : Map.of("logging.level.com.sanye.admin", "debug",
                "spring.devtools.restart.enabled", "true",
                "spring.datasource.druid.stat-view-servlet.enabled", "true").entrySet()) {
            assertThrows(IllegalStateException.class,
                    () -> guard.postProcessEnvironment(valid().withProperty(entry.getKey(), entry.getValue()), null));
        }
        String sentinel = UUID.randomUUID().toString();
        var failure = assertThrows(IllegalStateException.class,
                () -> guard.postProcessEnvironment(valid().withProperty("spring.devtools.restart.enabled", sentinel), null));
        assertFalse(failure.getMessage().contains(sentinel));
        assertNull(failure.getCause());
    }

    @Test void registeredProcessorRejectsBeforeContextAndAcceptsInjectedProperties() {
        SpringApplication app = new SpringApplication(Probe.class);
        app.setWebApplicationType(WebApplicationType.NONE);
        app.setLogStartupInfo(false);
        app.setDefaultProperties(Map.of("spring.config.name", "tr05-no-config", "spring.main.banner-mode", "off"));
        assertThrows(IllegalStateException.class, app::run);
        app.addInitializers(context -> assertNotNull(context.getEnvironment().getProperty("token.secret")));
        var injected = new java.util.HashMap<String, Object>();
        injected.put("spring.config.name", "tr05-no-config");
        injected.put("spring.main.banner-mode", "off");
        for (String key : new String[] {"token.secret", "sanye-admin.manage-token",
                "spring.datasource.druid.master.password", "spring.data.redis.password"}) {
            injected.put(key, UUID.randomUUID().toString());
        }
        app.setDefaultProperties(injected);
        try (var context = app.run()) { assertTrue(context.isActive()); }
    }

    @Configuration(proxyBeanMethods = false)
    static class Probe { }
}
