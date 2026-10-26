package com.sanye.admin.config;

import com.sanye.admin.framework.config.SecurityConfig;
import com.sanye.admin.framework.config.properties.PermitAllUrlProperties;
import com.sanye.admin.framework.security.filter.JwtAuthenticationTokenFilter;
import com.sanye.admin.framework.security.handle.AuthenticationEntryPointImpl;
import com.sanye.admin.framework.security.handle.LogoutSuccessHandlerImpl;
import com.sanye.admin.framework.web.service.TokenService;
import com.sanye.admin.common.core.domain.entity.SysUser;
import com.sanye.admin.common.core.domain.model.LoginUser;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockServletContext;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.util.List;
import java.util.Set;

import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminDiagnosticsSecurityTest {
    @Test
    void diagnosticsAreDisabledByDefaultAndCanBeExplicitlyEnabled() throws Exception {
        var environment = new MockEnvironment();
        var loader = new YamlPropertySourceLoader();
        for (String file : List.of("application.yml", "application-druid.yml")) {
            for (var source : loader.load(file, new ClassPathResource(file))) {
                environment.getPropertySources().addLast(source);
            }
        }
        for (String key : List.of("springdoc.api-docs.enabled", "springdoc.swagger-ui.enabled", "spring.datasource.druid.statViewServlet.enabled")) {
            org.junit.jupiter.api.Assertions.assertEquals(false, environment.getProperty(key, Boolean.class));
        }
        environment.setProperty("SANYE_ADMIN_SWAGGER_ENABLED", "true");
        environment.setProperty("SANYE_ADMIN_DRUID_ENABLED", "true");
        for (String key : List.of("springdoc.api-docs.enabled", "springdoc.swagger-ui.enabled", "spring.datasource.druid.statViewServlet.enabled")) {
            org.junit.jupiter.api.Assertions.assertEquals(true, environment.getProperty(key, Boolean.class));
        }
    }

    @Test
    void anonymousDiagnosticsAreDeniedWhileLoginAndCaptchaRemainReachable() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            var tokenService = mock(TokenService.class);
            var properties = mock(PermitAllUrlProperties.class);
            when(properties.getUrls()).thenReturn(List.of("/swagger-ui.html", "/v3/api-docs/**", "/druid/**"));
            context.addBeanFactoryPostProcessor(factory -> {
                factory.registerSingleton("tokenService", tokenService);
                factory.registerSingleton("logoutSuccessHandler", mock(LogoutSuccessHandlerImpl.class));
                factory.registerSingleton("permitAllUrl", properties);
            });
            context.register(ProbeConfiguration.class);
            context.refresh();
            var mvc = MockMvcBuilders.webAppContextSetup(context)
                    .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();

            for (String path : diagnosticsPaths()) {
                mvc.perform(get(path)).andExpect(jsonPath("$.code").value(401));
            }
            for (String path : List.of("/login", "/captchaImage", "/register")) {
                mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().string("可访问"));
            }
            when(tokenService.getLoginUser(any())).thenReturn(new LoginUser(new SysUser(), Set.of()));
            for (String path : diagnosticsPaths()) {
                mvc.perform(get(path)).andExpect(status().isForbidden());
            }
            when(tokenService.getLoginUser(any())).thenReturn(new LoginUser(new SysUser(), Set.of("tool:swagger:list")));
            mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
            mvc.perform(get("/druid/index.html")).andExpect(status().isForbidden());
            when(tokenService.getLoginUser(any())).thenReturn(new LoginUser(new SysUser(), Set.of("monitor:druid:list")));
            mvc.perform(get("/druid/index.html")).andExpect(status().isOk());
            mvc.perform(get("/v3/api-docs")).andExpect(status().isForbidden());
            when(tokenService.getLoginUser(any())).thenReturn(new LoginUser(new SysUser(), Set.of("*:*:*")));
            for (String path : diagnosticsPaths()) {
                mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().string("可访问"));
            }
        }
    }

    @Test
    void explicitLocalProfileAllowsSwaggerButStillProtectsDruid() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.getEnvironment().setActiveProfiles("local");
            var properties = mock(PermitAllUrlProperties.class);
            when(properties.getUrls()).thenReturn(List.of("/druid/**"));
            context.addBeanFactoryPostProcessor(factory -> {
                factory.registerSingleton("tokenService", mock(TokenService.class));
                factory.registerSingleton("logoutSuccessHandler", mock(LogoutSuccessHandlerImpl.class));
                factory.registerSingleton("permitAllUrl", properties);
            });
            context.register(ProbeConfiguration.class);
            context.refresh();
            var mvc = MockMvcBuilders.webAppContextSetup(context)
                    .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
            for (String path : List.of("/swagger-ui.html", "/swagger-ui/index.html", "/v3/api-docs", "/v3/api-docs/swagger-config")) {
                mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().string("可访问"));
            }
            mvc.perform(get("/druid/index.html")).andExpect(jsonPath("$.code").value(401));
            mvc.perform(get("/druid/css/style.css")).andExpect(jsonPath("$.code").value(401));
        }
    }

    private static List<String> diagnosticsPaths() {
        return List.of("/swagger-ui.html", "/swagger-ui/index.html", "/swagger-ui/swagger-ui.css",
                "/v3/api-docs", "/v3/api-docs/swagger-config", "/druid/index.html", "/druid/css/style.css");
    }

    @Configuration
    @EnableWebSecurity
    @EnableWebMvc
    @Import(SecurityConfig.class)
    static class ProbeConfiguration {
        @Bean
        JwtAuthenticationTokenFilter authenticationTokenFilter() { return new JwtAuthenticationTokenFilter(); }

        @Bean
        AuthenticationEntryPointImpl unauthorizedHandler() { return new AuthenticationEntryPointImpl(); }

        @Bean
        InMemoryUserDetailsManager users() {
            return new InMemoryUserDetailsManager(User.withUsername("operator").password("unused").roles("ADMIN").build());
        }

        @Bean
        ProbeController controller() { return new ProbeController(); }
    }

    @RestController
    static class ProbeController {
        @GetMapping(value = {"/login", "/register", "/captchaImage", "/swagger-ui.html", "/swagger-ui/index.html",
                "/swagger-ui/swagger-ui.css", "/v3/api-docs", "/v3/api-docs/swagger-config", "/druid/index.html", "/druid/css/style.css"}, produces = "text/plain;charset=UTF-8")
        String probe() { return "可访问"; }
    }
}
