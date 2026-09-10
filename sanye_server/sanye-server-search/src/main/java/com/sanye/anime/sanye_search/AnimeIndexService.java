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
import java.util.HashSet;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 搜索索引构建与同步（T-D-03）：按需创建索引，从 anime 服务分页拉取主数据全量重建。
 */
@Service
public class AnimeIndexService {

    private static final Logger log = LoggerFactory.getLogger(AnimeIndexService.class);

    private final ElasticsearchClient es;
    private final AnimeClient animeClient;
    private final String index;
    @Autowired
    private DataSource dataSource;

    /** 注入 ES 客户端和动漫远程客户端，负责索引初始化与同步。 */
    public AnimeIndexService(ElasticsearchClient es, AnimeClient animeClient,
                             @Value("${sanye.search.index:sanye_anime_live}") String index) {
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
        CreateIndexRequest request = CreateIndexRequest.of(c -> c.index(index + "_" + UUID.randomUUID())
                .aliases(index, a -> a.isWriteIndex(true)).mappings(mappings()));
        es.indices().create(request);
        log.info("创建搜索索引 {}", index);
    }

    /** 查询索引文档数量，用于管理端监控。 */
    public long count() throws IOException {
        return es.count(c -> c.index(index)).count();
    }

    /** 分页拉取动画服务数据并批量写入搜索索引。 */
    public int syncAll() throws IOException {
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement("select pg_try_advisory_xact_lock(731903)")) {
                try (var result = statement.executeQuery()) {
                    if (!result.next() || !result.getBoolean(1)) throw new IOException("Index rebuild already running");
                }
            }
            int total = rebuild();
            connection.commit();
            return total;
        } catch (java.sql.SQLException ex) {
            throw new IOException("Index rebuild lock failed", ex);
        }
    }

    int rebuild() throws IOException {
        // Never replace a concrete index: operators must select a separate alias for legacy data.
        if (!es.indices().existsAlias(a -> a.name(index)).value()) {
            throw new IOException("Search target must be an alias");
        }
        String candidate = index + "_" + UUID.randomUUID();
        log.info("Index rebuild started alias={} candidate={}", index, candidate);
        es.indices().create(CreateIndexRequest.of(c -> c.index(candidate).mappings(mappings())));
        int page = 1;
        int total = 0;
        long expected = -1;
        var ids = new HashSet<Long>();
        while (true) {
            ApiResponse<PageResult<AnimeBrief>> response = animeClient.list(page, 50);
            if (response == null || response.code() != 0 || response.data() == null || response.data().items() == null) {
                throw new IOException("Anime source unavailable");
            }
            var data = response.data();
            if (expected < 0) expected = data.total();
            if (expected < 0 || expected != data.total() || data.page() != page || data.items().size() > 50)
                throw new IOException("Anime source changed during rebuild");
            List<SearchDoc> docs = response.data().items().stream().map(SearchDoc::from).toList();
            for (var doc : docs) {
                if (!ids.add(doc.id()) || !"已发布".equals(doc.status())) throw new IOException("Invalid source document");
            }
            if (!docs.isEmpty()) bulkIndex(candidate, docs);
            total += docs.size();
            if (total == expected) break;
            if (total > expected || docs.isEmpty()) throw new IOException("Incomplete anime source");
            page++;
        }
        es.indices().refresh(r -> r.index(candidate));
        if (es.count(c -> c.index(candidate)).count() != total) throw new IOException("Index validation failed");
        var old = es.indices().getAlias(a -> a.name(index)).result().keySet();
        var switchRequest = new co.elastic.clients.elasticsearch.indices.UpdateAliasesRequest.Builder();
        old.forEach(name -> switchRequest.actions(a -> a.remove(r -> r.index(name).alias(index))));
        switchRequest.actions(a -> a.add(r -> r.index(candidate).alias(index).isWriteIndex(true)));
        if (!es.indices().updateAliases(switchRequest.build()).acknowledged()) throw new IOException("Alias switch not acknowledged");
        log.info("Index rebuild completed alias={} candidate={} docs={}", index, candidate, total);
        return total;
    }

    public void delete(long id) throws IOException { es.delete(d -> d.index(index).id(String.valueOf(id))); }
    public void upsert(SearchDoc doc) throws IOException {
        ensureIndex();
        es.index(i -> i.index(index).requireAlias(true).id(String.valueOf(doc.id())).document(doc));
    }

    /** 将一批作品转换为 ES bulk index 操作。 */
    private void bulkIndex(String target, List<SearchDoc> docs) throws IOException {
        BulkRequest.Builder builder = new BulkRequest.Builder();
        docs.forEach(doc -> builder.operations(op -> op.index(i -> i.index(target)
                .id(String.valueOf(doc.id()))
                .document(doc))));
        if (es.bulk(builder.build()).errors()) throw new IOException("Index bulk write failed");
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
