package com.sanye.anime.sanye_job;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class JobServiceApplication {

    /** 启动作业服务，预留定时任务和后台调度运行环境。 */
    public static void main(String[] args) {
        SpringApplication.run(JobServiceApplication.class, args);
    }
}
