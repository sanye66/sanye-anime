package com.sanye.anime.sanye_favorite;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class FavoriteServiceApplication {

    /** 启动收藏与历史服务，加载归属校验和远程作品查询配置。 */
    public static void main(String[] args) {
        SpringApplication.run(FavoriteServiceApplication.class, args);
    }
}
