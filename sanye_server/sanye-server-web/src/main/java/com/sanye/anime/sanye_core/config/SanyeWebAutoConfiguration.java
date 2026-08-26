package com.sanye.anime.sanye_core.config;

import com.sanye.anime.sanye_core.auth.AuthContextFilter;
import com.sanye.anime.sanye_core.controller.SystemController;
import com.sanye.anime.sanye_core.exception.GlobalExceptionHandler;
import com.sanye.anime.sanye_core.feign.FeignSupportConfig;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Import;

/**
 * Web 共享能力自动装配（T-C-04 联调修复）：
 * 业务服务启动时自动注册请求 ID 过滤器、鉴权上下文过滤器、统一异常处理、
 * 系统基础接口与 OpenFeign 基线，避免每个服务手工添加 @ComponentScan。
 * 网关为响应式工程，不依赖本模块，不受影响。
 */
@AutoConfiguration
@Import({
        RequestIdFilter.class,
        AuthContextFilter.class,
        GlobalExceptionHandler.class,
        SystemController.class,
        FeignSupportConfig.class
})
public class SanyeWebAutoConfiguration {
}
