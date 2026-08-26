package com.sanye.anime.sanye_ai_chat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class AiChatServiceApplication {

    /** 启动 AI 对话服务，并加载统一 Web、鉴权和数据访问配置。 */
    public static void main(String[] args) {
        SpringApplication.run(AiChatServiceApplication.class, args);
    }
}
