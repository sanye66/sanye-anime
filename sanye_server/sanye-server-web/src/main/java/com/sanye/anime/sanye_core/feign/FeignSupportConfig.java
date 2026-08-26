package com.sanye.anime.sanye_core.feign;

import feign.Retryer;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 服务间调用基线（T-B-07，设计 8.1 节）：
 * 统一开启 OpenFeign，默认不自动重试（防止非幂等接口重复执行）；
 * 幂等接口如需重试，在对应 Feign 客户端上单独配置 Retryer。
 */
@Configuration
@EnableFeignClients(basePackages = "com.sanye.anime")
public class FeignSupportConfig {

    @Bean
    /** 禁用默认重试，避免非幂等服务间写操作被重复执行。 */
    public Retryer feignRetryer() {
        return Retryer.NEVER_RETRY;
    }
}
