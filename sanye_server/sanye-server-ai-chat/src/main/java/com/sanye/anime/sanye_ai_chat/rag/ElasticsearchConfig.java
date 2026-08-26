package com.sanye.anime.sanye_ai_chat.rag;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RAG 用 Elasticsearch 客户端（T-E-03）：与搜索服务共用本地 ES 实例。
 */
@Configuration
public class ElasticsearchConfig {

    /** 创建 RAG 专用 ES 客户端，连接地址由本地或部署环境配置。 */
    @Bean
    public ElasticsearchClient ragElasticsearchClient(
            @Value("${sanye.rag.es-host:http://127.0.0.1:9200}") String host) {
        RestClient restClient = RestClient.builder(HttpHost.create(host)).build();
        return new ElasticsearchClient(new RestClientTransport(restClient, new JacksonJsonpMapper()));
    }
}
