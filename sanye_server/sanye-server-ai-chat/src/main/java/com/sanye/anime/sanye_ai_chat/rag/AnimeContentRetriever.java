package com.sanye.anime.sanye_ai_chat.rag;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import dev.langchain4j.rag.content.Content;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.query.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * RAG 检索器（T-E-03，LangChain4j ContentRetriever）：
 * ES BM25 多字段匹配（title^3/tags/summary）+ PUBLISHED 过滤 + top-k；
 * 检索结果经 DefaultRetrievalAugmentor 注入提示词，供模型引用。
 */
@Component
public class AnimeContentRetriever implements ContentRetriever {

    private static final Logger log = LoggerFactory.getLogger(AnimeContentRetriever.class);

    private final ElasticsearchClient es;
    private final String index;
    private final int topK;

    /** 注入 ES 客户端和检索配置，统一限制索引与返回条数。 */
    public AnimeContentRetriever(ElasticsearchClient es,
                                 @Value("${sanye.rag.index:sanye_anime}") String index,
                                 @Value("${sanye.rag.top-k:3}") int topK) {
        this.es = es;
        this.index = index;
        this.topK = topK;
    }

    /** 查询已发布作品的相关内容，ES 异常时返回空结果让模型继续降级工作。 */
    @Override
    public List<Content> retrieve(Query query) {
        try {
            SearchResponse<RagDoc> response = es.search(s -> s
                    .index(index)
                    .query(q -> q.bool(b -> b
                            .must(m -> m.multiMatch(mm -> mm.query(query.text())
                                    .fields("title^3", "tags", "summary")))
                            .filter(f -> f.term(t -> t.field("status").value("已发布")))))
                    .size(topK), RagDoc.class);
            List<Content> contents = response.hits().hits().stream()
                    .filter(hit -> hit.source() != null)
                    .map(hit -> {
                        RagDoc doc = hit.source();
                        String summary = doc.summary() == null || doc.summary().isBlank()
                                ? doc.title() : doc.summary();
                        return Content.from("《" + doc.title() + "》：" + summary);
                    })
                    .toList();
            if (!contents.isEmpty()) {
                log.info("RAG 检索命中 query={} count={}", query.text(), contents.size());
            }
            return contents;
        } catch (Exception ex) {
            log.warn("RAG 检索不可用 query={} error={}", query.text(), ex.getMessage());
            return List.of();
        }
    }

    // RAG 文档字段与 sanye_anime 索引保持一致，避免严格 JSON 映射因未知字段导致整次检索降级。
    private record RagDoc(long id, String title, String originalTitle, String type, int year, double score,
                          String status, String coverUrl, List<String> tags, String updateText, String summary) {
    }
}
