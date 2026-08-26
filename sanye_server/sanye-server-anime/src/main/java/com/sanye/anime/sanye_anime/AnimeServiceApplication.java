package com.sanye.anime.sanye_anime;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class AnimeServiceApplication {

    /** 启动动漫目录服务，提供公开目录和管理端内容接口。 */
    public static void main(String[] args) {
        SpringApplication.run(AnimeServiceApplication.class, args);
    }
}
