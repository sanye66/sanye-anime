package com.sanye.anime.sanye_feedback;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class FeedbackServiceApplication {

    /** 启动反馈服务，提供用户提交和管理端处理接口。 */
    public static void main(String[] args) {
        SpringApplication.run(FeedbackServiceApplication.class, args);
    }
}
