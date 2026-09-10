package com.sanye.admin.web.controller.admin;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 管理代理接口权限契约，防止新增端点绕过 RuoYi 方法级授权。 */
class AdminControllerSecurityTest {

    private static final List<Class<?>> CONTROLLERS = List.of(
            AdminAnimeController.class,
            AdminDashboardController.class,
            AdminFeedbackController.class,
            AdminLegalController.class,
            com.sanye.admin.web.controller.monitor.XxlJobController.class
    );

    @Test
    void everyPublicAdminEndpointDeclaresPreAuthorize() {
        for (Class<?> controller : CONTROLLERS) {
            for (Method method : controller.getDeclaredMethods()) {
                if (!Modifier.isPublic(method.getModifiers())
                        || !AnnotatedElementUtils.hasAnnotation(method, RequestMapping.class)) {
                    continue;
                }
                assertNotNull(AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class),
                        () -> controller.getSimpleName() + "." + method.getName() + " 缺少 @PreAuthorize");
            }
        }
    }

    @Test
    void urlImportRequiresContentEditPermission() throws NoSuchMethodException {
        Method method = AdminAnimeController.class.getMethod("importUrl", java.util.Map.class);
        PreAuthorize authorization = AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class);

        assertNotNull(authorization);
        assertTrue(authorization.value().contains("anime:content:edit"));
    }

    @Test
    void dashboardStatsRequiresAuthentication() throws NoSuchMethodException {
        Method method = AdminDashboardController.class.getMethod("stats");
        PreAuthorize authorization = AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class);

        assertNotNull(authorization);
        assertTrue(authorization.value().contains("isAuthenticated()"));
    }
}
