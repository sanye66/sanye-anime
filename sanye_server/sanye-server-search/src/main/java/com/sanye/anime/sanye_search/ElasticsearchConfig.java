package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Elasticsearch 客户端（T-D-03）：官方 Java Client 8.17，直连本地 ES。
 */
@Configuration
public class ElasticsearchConfig {

    /** 创建搜索服务使用的 ES 客户端，连接地址由部署配置注入。 */
    @Bean
    public ElasticsearchClient elasticsearchClient(
            @Value("${sanye.search.es-host:http://127.0.0.1:9200}") String host) {
        RestClient restClient = RestClient.builder(HttpHost.create(host)).build();
        return new ElasticsearchClient(new RestClientTransport(restClient, new JacksonJsonpMapper()));
    }
}
