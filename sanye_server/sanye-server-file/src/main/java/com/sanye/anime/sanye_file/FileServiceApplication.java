package com.sanye.anime.sanye_file;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.sanye.anime")
public class FileServiceApplication {

    /** 启动文件服务，加载上传白名单和存储路径配置。 */
    public static void main(String[] args) {
        SpringApplication.run(FileServiceApplication.class, args);
    }
}
