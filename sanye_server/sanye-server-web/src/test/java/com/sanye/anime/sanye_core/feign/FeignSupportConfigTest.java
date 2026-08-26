package com.sanye.anime.sanye_core.feign;

import com.sanye.anime.sanye_core.web.WebTestConfig;
import feign.RequestInterceptor;
import feign.Retryer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest(classes = WebTestConfig.class)
class FeignSupportConfigTest {

    @Autowired
    private RequestInterceptor requestInterceptor;

    @Autowired
    private Retryer retryer;

    @Test
    void feignBaselineBeansExist() {
        assertNotNull(requestInterceptor);
        assertNotNull(retryer);
    }
}
