package com.sanye.anime.sanye_search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.stereotype.Service;

/** 订阅传输只读取 JSON，不解释或执行来源规则。 */
@Service
public class SubscriptionFetchService {
    private final ObjectMapper mapper;
    private final Fetcher fetcher;

    interface Fetcher { String fetch(String url) throws Exception; }

    @org.springframework.beans.factory.annotation.Autowired
    public SubscriptionFetchService(ObjectMapper mapper) {
        this(mapper, SubscriptionFetchPolicy::fetch);
    }

    SubscriptionFetchService(ObjectMapper mapper, Fetcher fetcher) {
        this.mapper = mapper;
        this.fetcher = fetcher;
    }

    public String fetch(String url) {
        try {
            String content = fetcher.fetch(url);
            try (var parser = mapper.getFactory().createParser(content)) {
                var json = mapper.readTree(parser);
                if (json == null || !json.isContainerNode() || parser.nextToken() != null) {
                    throw new java.io.IOException("订阅内容必须是单个 JSON 对象或数组");
                }
            }
            return content;
        } catch (Exception failure) {
            throw new BusinessException(ErrorCode.PARAM_INVALID,
                    "订阅读取失败，请检查公网 HTTPS 地址、JSON 格式和网络连接");
        }
    }
}
