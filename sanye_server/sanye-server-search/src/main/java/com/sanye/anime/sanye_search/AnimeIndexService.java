package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.mapping.TypeMapping;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_search.client.AnimeBrief;
import com.sanye.anime.sanye_search.client.AnimeClient;
import com.sanye.anime.sanye_search.model.SearchDoc;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;

/**
 * 搜索索引构建与同步（T-D-03）：按需创建索引，从 anime 服务分页拉取主数据全量重建。
 */
@Service
public class AnimeIndexService {

    private static final Logger log = LoggerFactory.getLogger(AnimeIndexService.class);

    private final ElasticsearchClient es;
    private final AnimeClient animeClient;
    private final String index;

    /** 注入 ES 客户端和动漫远程客户端，负责索引初始化与同步。 */
    public AnimeIndexService(ElasticsearchClient es, AnimeClient animeClient,
                             @Value("${sanye.search.index:sanye_anime}") String index) {
        this.es = es;
        this.animeClient = animeClient;
        this.index = index;
    }

    /** 确保目标索引存在，已存在时不重复创建。 */
    public void ensureIndex() throws IOException {
        boolean exists = es.indices().exists(e -> e.index(index)).value();
        if (exists) {
            return;
        }
        CreateIndexRequest request = CreateIndexRequest.of(c -> c.index(index).mappings(mappings()));
        es.indices().create(request);
        log.info("创建搜索索引 {}", index);
    }

    /** 查询索引文档数量，用于管理端监控。 */
    public long count() throws IOException {
        return es.count(c -> c.index(index)).count();
    }

    /** 分页拉取动画服务数据并批量写入搜索索引。 */
    public int syncAll() throws IOException {
        // 全量同步必须先清掉旧文档，否则下架或清理后的测试作品会残留在搜索结果中。
        es.deleteByQuery(d -> d.index(index).query(q -> q.matchAll(m -> m)));
        int page = 1;
        int total = 0;
        while (page <= 100) {
            ApiResponse<PageResult<AnimeBrief>> response = animeClient.list(page, 50);
            if (response == null || response.code() != 0 || response.data() == null || response.data().items().isEmpty()) {
                break;
            }
            List<SearchDoc> docs = response.data().items().stream().map(SearchDoc::from).toList();
            bulkIndex(docs);
            total += docs.size();
            if (docs.size() < 50) {
                break;
            }
            page++;
        }
        log.info("搜索索引同步完成 docs={}", total);
        return total;
    }

    /** 将一批作品转换为 ES bulk index 操作。 */
    private void bulkIndex(List<SearchDoc> docs) throws IOException {
        BulkRequest.Builder builder = new BulkRequest.Builder();
        docs.forEach(doc -> builder.operations(op -> op.index(i -> i.index(index)
                .id(String.valueOf(doc.id()))
                .document(doc))));
        es.bulk(builder.build());
    }

    /** 定义搜索字段的类型和索引方式，保持查询字段契约稳定。 */
    private TypeMapping mappings() {
        return TypeMapping.of(m -> m
                .properties("id", p -> p.long_(l -> l))
                .properties("title", p -> p.text(t -> t))
                .properties("originalTitle", p -> p.text(t -> t))
                .properties("tags", p -> p.text(t -> t))
                .properties("summary", p -> p.text(t -> t))
                .properties("updateText", p -> p.keyword(k -> k))
                .properties("type", p -> p.keyword(k -> k))
                .properties("year", p -> p.integer(i -> i))
                .properties("score", p -> p.double_(d -> d))
                .properties("status", p -> p.keyword(k -> k))
                .properties("coverUrl", p -> p.keyword(k -> k)));
    }
}
