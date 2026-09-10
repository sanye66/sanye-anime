package com.sanye.admin.web.controller.monitor;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.sanye.admin.common.core.domain.AjaxResult;
import com.sanye.admin.framework.web.domain.Server;
import com.sanye.admin.common.exception.ServiceException;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 服务器监控
 * 
 * @author ruoyi
 */
@RestController
@RequestMapping("/monitor/server")
public class ServerController
{
    private static final Logger log = LoggerFactory.getLogger(ServerController.class);
    private static final long MAX_AGE_NANOS = TimeUnit.SECONDS.toNanos(30);
    private final ScheduledExecutorService sampler = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "sanye-server-monitor-sampler");
        thread.setDaemon(true);
        return thread;
    });
    private volatile Snapshot snapshot;

    private record Snapshot(Server server, long sampledAt) {}

    @PostConstruct
    void startSampling()
    {
        sampler.scheduleWithFixedDelay(this::refreshSnapshot, 0, 5, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stopSampling()
    {
        sampler.shutdownNow();
    }

    void refreshSnapshot()
    {
        try
        {
            Server server = collect();
            snapshot = new Snapshot(server, nanoTime());
        }
        catch (Exception ex)
        {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("Server monitoring sample failed: {}", ex.getClass().getSimpleName());
        }
    }

    @PreAuthorize("@ss.hasPermi('monitor:server:list')")
    @GetMapping()
    public AjaxResult getInfo()
    {
        Snapshot current = snapshot;
        if (current == null || nanoTime() - current.sampledAt() >= MAX_AGE_NANOS)
        {
            throw new ServiceException("服务器监控采样暂不可用，请稍后刷新");
        }
        return AjaxResult.success(current.server());
    }

    protected long nanoTime()
    {
        return System.nanoTime();
    }

    protected Server collect() throws Exception
    {
        Server server = new Server();
        server.copyTo();
        return server;
    }
}
