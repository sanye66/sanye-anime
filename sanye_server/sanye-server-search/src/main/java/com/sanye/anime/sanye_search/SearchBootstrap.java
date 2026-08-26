package com.sanye.anime.sanye_search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 启动时初始化搜索索引：ES 不可用时仅告警，搜索接口降级（SEARCH_UNAVAILABLE）。
 */
@Component
public class SearchBootstrap {

    private static final Logger log = LoggerFactory.getLogger(SearchBootstrap.class);

    private final AnimeIndexService animeIndexService;

    /** 注入索引服务，在应用启动后执行一次可降级的索引初始化。 */
    public SearchBootstrap(AnimeIndexService animeIndexService) {
        this.animeIndexService = animeIndexService;
    }

    @EventListener(ApplicationReadyEvent.class)
    /** 启动时创建并按需同步搜索索引，ES 不可用时保留搜索降级能力。 */
    public void init() {
        try {
            animeIndexService.ensureIndex();
            long count = animeIndexService.count();
            if (count == 0) {
                int indexed = animeIndexService.syncAll();
                log.info("搜索索引初始化完成 docs={}", indexed);
            } else {
                log.info("搜索索引已存在 docs={}", count);
            }
        } catch (Exception ex) {
            log.warn("搜索索引初始化失败（搜索降级） error={}", ex.getMessage());
        }
    }
}
