package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.json.JsonData;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_search.model.SearchDoc;
import com.sanye.anime.sanye_search.model.SearchHitView;
import com.sanye.anime.sanye_search.client.AnimeBrief;
import com.sanye.anime.sanye_search.client.AnimeClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 搜索服务（T-D-03）：BM25 多字段匹配 + PUBLISHED/类型/状态/年份过滤 + 分页 + 高亮；
 * ES 零命中或不可用时回源动漫公开目录，两条链路都不可用才返回 SEARCH_UNAVAILABLE。
 */
@Service
public class SearchService {

    private static final Logger log = LoggerFactory.getLogger(SearchService.class);

    private final ElasticsearchClient es;
    private final AnimeClient animeClient;
    private final String index;

    /** 注入 ES、动漫目录客户端和受控索引名称。 */
    public SearchService(ElasticsearchClient es, AnimeClient animeClient,
                         @Value("${sanye.search.index:sanye_anime}") String index) {
        this.es = es;
        this.animeClient = animeClient;
        this.index = index;
    }

    /** 校验搜索条件并执行 ES 多字段查询、过滤、高亮和分页。 */
    public PageResult<SearchHitView> search(String keyword, String type, String status, Integer year,
                                            Integer yearBefore, int page, int size) {
        if (keyword == null || keyword.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "关键词不能为空");
        }
        if (keyword.length() > 50) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "关键词不能超过 50 字");
        }
        if (type != null && type.length() > 20) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "类型参数过长");
        }
        if (status != null && status.length() > 20) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "状态参数过长");
        }
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        PageResult<SearchHitView> indexedResult = null;
        try {
            SearchResponse<SearchDoc> response = es.search(s -> s
                    .index(index)
                    .query(buildQuery(keyword, type, status, year, yearBefore))
                    .highlight(h -> h.fields("title", f -> f).fields("summary", f -> f))
                    .from((safePage - 1) * safeSize)
                    .size(safeSize), SearchDoc.class);
            List<SearchHitView> items = response.hits().hits().stream().map(hit -> {
                SearchDoc doc = hit.source();
                String titleHighlight = firstHighlight(hit.highlight().get("title"), doc == null ? "" : doc.title());
                String summaryHighlight = firstHighlight(hit.highlight().get("summary"), doc == null ? "" : doc.summary());
                return new SearchHitView(doc.id(), doc.title(), titleHighlight, doc.originalTitle(), doc.type(),
                        doc.year(), doc.score(), doc.status(), doc.coverUrl(), doc.tags(), doc.updateText(),
                        summaryHighlight);
            }).toList();
            long total = response.hits() != null && response.hits().total() != null
                    ? response.hits().total().value() : items.size();
            indexedResult = PageResult.of(items, safePage, safeSize, total);
            if (!items.isEmpty()) {
                return indexedResult;
            }
        } catch (Exception ex) {
            log.warn("ES 搜索不可用，尝试回源目录 keyword={} error={}", keyword, ex.getMessage());
        }
        try {
            ApiResponse<PageResult<AnimeBrief>> response = animeClient.search(
                    keyword, type, status, year, yearBefore, safePage, safeSize);
            if (response != null && response.code() == 0 && response.data() != null) {
                List<SearchHitView> items = response.data().items().stream().map(brief ->
                        new SearchHitView(brief.id(), brief.title(), brief.title(), brief.originalTitle(), brief.type(),
                                brief.year(), brief.score(), brief.status(), brief.coverUrl(), brief.tags(),
                                brief.updateText(), "")).toList();
                return PageResult.of(items, response.data().page(), response.data().size(), response.data().total());
            }
        } catch (Exception ex) {
            log.warn("目录搜索回源不可用 keyword={} error={}", keyword, ex.getMessage());
        }
        if (indexedResult != null) {
            return indexedResult;
        }
        throw new BusinessException(ErrorCode.SEARCH_UNAVAILABLE, "搜索服务暂不可用，请稍后重试");
    }

    /** 构造全文匹配和已发布、类型、状态、年份过滤条件。 */
    private Query buildQuery(String keyword, String type, String status, Integer year, Integer yearBefore) {
        return Query.of(q -> q.bool(b -> {
            if (keyword != null && !keyword.isBlank()) {
                b.must(m -> m.multiMatch(mm -> mm.query(keyword)
                        .fields("title^3", "originalTitle^2", "tags", "summary")));
            } else {
                b.must(m -> m.matchAll(ma -> ma));
            }
            b.filter(f -> f.term(t -> t.field("status").value("已发布")));
            if (type != null && !type.isBlank()) {
                b.filter(f -> f.term(t -> t.field("type").value(type)));
            }
            if ("连载中".equals(status)) {
                b.filter(f -> f.wildcard(w -> w.field("updateText").value("*更新*")));
            } else if ("已完结".equals(status)) {
                b.filter(f -> f.term(t -> t.field("updateText").value("已完结")));
            }
            if (year != null) {
                b.filter(f -> f.term(t -> t.field("year").value(year)));
            }
            if (yearBefore != null) {
                b.filter(f -> f.range(r -> r.number(n -> n.field("year").lte((double) yearBefore))));
            }
            return b;
        }));
    }

    /** 取首个高亮片段；ES 未返回高亮时回退原文。 */
    private String firstHighlight(List<String> fragments, String fallback) {
        if (fragments == null || fragments.isEmpty()) {
            return fallback;
        }
        return String.join("…", fragments);
    }
}
