package com.sanye.anime.sanye_core.config;

import com.sanye.anime.sanye_core.auth.AuthContextFilter;
import com.sanye.anime.sanye_core.controller.SystemController;
import com.sanye.anime.sanye_core.exception.GlobalExceptionHandler;
import com.sanye.anime.sanye_core.feign.FeignSupportConfig;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 验证 SanyeWebAutoConfiguration 能为业务服务注册全部共享 Web 组件，
 * 保证请求 ID、鉴权上下文、统一异常、system 接口与 Feign 基线开箱即用。
 */
class SanyeWebAutoConfigurationTest {

    private final WebApplicationContextRunner runner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(SanyeWebAutoConfiguration.class));

    @Test
    void registersAllSharedWebBeans() {
        runner.run(context -> {
            assertThat(context).hasSingleBean(RequestIdFilter.class);
            assertThat(context).hasSingleBean(AuthContextFilter.class);
            assertThat(context).hasSingleBean(GlobalExceptionHandler.class);
            assertThat(context).hasSingleBean(SystemController.class);
            assertThat(context).hasSingleBean(FeignSupportConfig.class);
        });
    }

    @Test
    void systemControllerExposesPingAndCapabilities() {
        runner.run(context -> {
            MockMvc mvc = MockMvcBuilders.standaloneSetup(context.getBean(SystemController.class)).build();
            mvc.perform(get("/api/v1/system/ping"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.pong").value(true));
            mvc.perform(get("/api/v1/system/capabilities"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[0]").value("anime"));
        });
    }
}
