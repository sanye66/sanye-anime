package com.sanye.anime.sanye_search;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class SearchServiceApplication {

    /** 启动搜索服务，初始化索引并提供搜索降级能力。 */
    public static void main(String[] args) {
        SpringApplication.run(SearchServiceApplication.class, args);
    }
}
