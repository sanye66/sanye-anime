package com.sanye.anime.sanye_gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class GatewayApplication {

    /** 启动网关服务，统一执行请求编号、跨域、鉴权和错误转换。 */
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
