package com.sanye.anime.sanye_core.config;

import java.io.PrintWriter;
import java.io.StringWriter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(OutputCaptureExtension.class)
class SensitiveConfigurationStartupTest {
    private static final String SECRET = java.util.UUID.randomUUID().toString();

    @Configuration(proxyBeanMethods = false)
    static class EmptyApplication { }

    private ConfigurableApplicationContext start(String... settings) {
        SpringApplication application = new SpringApplication(EmptyApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setLogStartupInfo(false);
        String[] arguments = new String[settings.length + 2];
        arguments[0] = "--spring.config.name=sanye-sensitive-test-missing";
        arguments[1] = "--spring.main.banner-mode=off";
        System.arraycopy(settings, 0, arguments, 2, settings.length);
        return application.run(arguments);
    }

    @Test
    void registrationRejectsMissingJwtBeforeContextStarts() {
        assertThatThrownBy(() -> start("--spring.application.name=sanye-server-gateway"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("sanye.auth.token-secret");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "123456", "sanye-local-jwt-secret-2026", "replace-me-with-a-secure-secret-123456789",
            "change-this-password", "example-credential-123", "sanye-dev-password", "aB9!fG8#xY7"})
    void rejectsMissingAndPlaceholderDatabasePasswords(String password) {
        assertThatThrownBy(() -> start("--SANYE_ENV=staging", "--spring.datasource.url=jdbc:unused",
                "--spring.datasource.password=" + password)).hasMessageContaining("spring.datasource.password");
    }

    @Test
    void validatesPropertiesAfterConfigDataLoading() {
        assertThatThrownBy(() -> start("--spring.config.location=classpath:sensitive-startup.properties"))
                .hasMessageContaining("sanye.auth.token-secret");
        try (var context = start("--spring.config.location=classpath:sensitive-startup.properties",
                "--SANYE_STARTUP_TEST_TOKEN=" + SECRET)) {
            assertThat(context.isActive()).isTrue();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"auth", "gateway"})
    void localRealServiceConfigurationRejectsMissingJwt(String service) {
        String location = "--spring.config.location=file:../sanye-server-" + service + "/src/main/resources/application.yml";
        assertThatThrownBy(() -> start(location, "--SANYE_ENV=local", "--AUTH_TOKEN_SECRET="))
                .hasMessageContaining("sanye.auth.token-secret");
        try (var context = start(location, "--SANYE_ENV=local", "--AUTH_TOKEN_SECRET=" + SECRET)) {
            assertThat(context.isActive()).isTrue();
        }
    }

    @Test
    void productionAliasEnforcesSameRulesAndRejectsLocalProfileMixing() {
        assertThatThrownBy(() -> start("--SANYE_ENV=production", "--spring.datasource.url=jdbc:unused"))
                .hasMessageContaining("spring.datasource.password").hasMessageNotContaining("SANYE_ENV");
        assertThatThrownBy(() -> start("--SANYE_ENV=local", "--spring.profiles.active=local,production"))
                .hasMessageContaining("spring.profiles.active");
        try (var context = start("--SANYE_ENV=production", "--spring.datasource.url=jdbc:unused",
                "--spring.datasource.password=aB9!fG8#xY7?")) {
            assertThat(context.isActive()).isTrue();
        }
    }

    @Test
    void completeInfrastructureInjectionStarts() {
        try (var context = start("--SANYE_ENV=test", "--spring.application.name=sanye-server-search",
                "--spring.data.redis.host=localhost", "--spring.data.redis.password=" + SECRET,
                "--spring.rabbitmq.username=service-account", "--spring.rabbitmq.password=" + SECRET,
                "--sanye.manage.internal-token=" + SECRET,
                "--spring.cloud.nacos.discovery.enabled=true", "--spring.cloud.nacos.config.enabled=true",
                "--spring.cloud.nacos.username=service-account", "--spring.cloud.nacos.password=" + SECRET,
                "--spring.cloud.nacos.discovery.namespace=test", "--spring.cloud.nacos.config.namespace=test",
                "--sanye.job.enabled=true", "--sanye.job.access-token=" + SECRET,
                "--sanye.job.admin-addresses=https://scheduler.invalid", "--sanye.ai.provider=openai",
                "--sanye.ai.api-key=" + SECRET)) {
            assertThat(context.isActive()).isTrue();
        }
    }

    @Test
    void validInjectedConfigurationStartsAndDisablesDiagnosticValues() {
        try (var context = start("--SANYE_ENV=prod", "--spring.application.name=sanye-server-auth",
                "--spring.datasource.url=jdbc:unused", "--spring.datasource.password=" + SECRET,
                "--sanye.auth.token-secret=" + SECRET, "--management.endpoint.env.show-values=always")) {
            assertThat(context.isActive()).isTrue();
            assertThat(context.getEnvironment().getProperty("management.endpoint.env.show-values")).isEqualTo("never");
            assertThat(context.getEnvironment().getProperty("management.endpoint.configprops.show-values")).isEqualTo("never");
        }
    }

    @Test
    void exceptionAndLogsNeverIncludeUnresolvedSensitiveExpression(CapturedOutput output) {
        String sentinel = "SensitiveSentinel827491";
        Exception failure = assertThrows(IllegalStateException.class, () -> start(
                "--spring.datasource.url=jdbc:unused", "--spring.datasource.password=${" + sentinel + "}"));
        StringWriter stack = new StringWriter();
        failure.printStackTrace(new PrintWriter(stack));
        assertThat(stack.toString()).doesNotContain(sentinel);
        assertThat(output.getAll()).doesNotContain(sentinel);
    }

    @Test
    void localAllowsDevelopmentDefaultsButCannotMixDeploymentProfiles() {
        try (var context = start("--SANYE_ENV=local", "--spring.datasource.url=jdbc:unused",
                "--spring.datasource.password=123456")) {
            assertThat(context.isActive()).isTrue();
        }
        assertThatThrownBy(() -> start("--SANYE_ENV=local", "--spring.profiles.active=local,prod"))
                .hasMessageContaining("spring.profiles.active");
        assertThatThrownBy(() -> start("--SANYE_ENV=test", "--spring.profiles.active=local"))
                .hasMessageContaining("spring.profiles.active");
        assertThatThrownBy(() -> start("--SANYE_ENV=unknown"))
                .hasMessageContaining("SANYE_ENV");
    }

    @ParameterizedTest
    @ValueSource(strings = {"--spring.data.redis.host=localhost", "--sanye.event.enabled=true",
            "--sanye.event.publisher-enabled=true", "--spring.application.name=sanye-server-search",
            "--spring.cloud.nacos.discovery.enabled=true", "--spring.cloud.nacos.config.enabled=true",
            "--sanye.job.enabled=true", "--sanye.ai.provider=openai", "--spring.application.name=sanye-server-job"})
    void enabledInfrastructureRequiresCredentials(String setting) {
        assertThatThrownBy(() -> start("--SANYE_ENV=test", setting))
                .isInstanceOf(IllegalStateException.class).hasMessageStartingWith("Invalid sensitive configuration:");
    }
}
