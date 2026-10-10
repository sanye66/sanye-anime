package com.sanye.admin.web.controller.monitor;

import com.sanye.admin.web.service.XxlJobAdminService;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class XxlJobControllerSecurityTest {
    public static class Permissions {
        final Set<String> allowed = new HashSet<>();
        public boolean hasPermi(String permission) { return allowed.contains(permission); }
    }
    @Configuration
    @EnableMethodSecurity
    static class Config {
        @Bean(name = "ss") Permissions permissions() { return new Permissions(); }
        @Bean XxlJobAdminService service() { return mock(XxlJobAdminService.class); }
        @Bean XxlJobController controller(XxlJobAdminService service) { return new XxlJobController(service); }
    }

    @Test void permissionsAreEnforcedBeforeServiceCalls() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var controller = context.getBean(XxlJobController.class);
            var service = context.getBean(XxlJobAdminService.class);
            var permissions = context.getBean(Permissions.class);
            assertThrows(AccessDeniedException.class, controller::status);
            assertThrows(AccessDeniedException.class, () -> controller.logs(1, 10, -1));
            assertThrows(AccessDeniedException.class, controller::run);
            verifyNoInteractions(service);
            permissions.allowed.add("monitor:job:list");
            controller.status();
            verify(service).status();
            assertThrows(AccessDeniedException.class, controller::run);
            assertThrows(AccessDeniedException.class, () -> controller.logs(1, 10, -1));
            permissions.allowed.add("monitor:job:query");
            controller.logs(1, 10, -1);
            verify(service).logs(1, 10, -1);
            assertThrows(AccessDeniedException.class, controller::run);
            permissions.allowed.add("monitor:job:changeStatus");
            assertEquals("调度已提交，请刷新日志查看执行结果", controller.run().get("msg"));
            verify(service).run();
        }
    }
}
