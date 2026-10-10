package com.sanye.anime.sanye_job.config;

import com.xxl.job.core.executor.impl.XxlJobSpringExecutor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.Assert;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "sanye.job.enabled", havingValue = "true")
public class XxlJobConfiguration {

    @Bean
    public XxlJobSpringExecutor xxlJobExecutor(
            @Value("${sanye.job.admin-addresses:}") String adminAddresses,
            @Value("${sanye.job.access-token:}") String accessToken,
            @Value("${sanye.job.appname:sanye_job}") String appname,
            @Value("${sanye.job.address:}") String address,
            @Value("${sanye.job.ip:}") String ip,
            @Value("${sanye.job.port:9999}") int port,
            @Value("${sanye.job.log-path:./logs/xxl-job}") String logPath,
            @Value("${sanye.job.log-retention-days:30}") int retentionDays,
            @Value("${sanye.manage.internal-token:}") String internalToken) {
        Assert.hasText(adminAddresses, "XXL-JOB admin addresses are required");
        Assert.hasText(accessToken, "XXL-JOB access token is required");
        Assert.hasText(internalToken, "Internal service token is required");
        Assert.hasText(appname, "XXL-JOB executor name is required");
        Assert.isTrue(port > 0 && port <= 65535, "Invalid XXL-JOB executor port");
        Assert.isTrue(retentionDays >= 3, "XXL-JOB log retention must be at least 3 days");
        XxlJobSpringExecutor executor = new XxlJobSpringExecutor();
        executor.setAdminAddresses(adminAddresses);
        executor.setAccessToken(accessToken);
        executor.setAppname(appname);
        executor.setAddress(address);
        executor.setIp(ip);
        executor.setPort(port);
        executor.setLogPath(logPath);
        executor.setLogRetentionDays(retentionDays);
        return executor;
    }
}
