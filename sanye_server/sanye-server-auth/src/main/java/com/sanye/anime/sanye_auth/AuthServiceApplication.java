package com.sanye.anime.sanye_auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class AuthServiceApplication {

    /** 启动 CAS 会话服务，负责票据校验和本地令牌签发。 */
    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}
