package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.Result;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.CountResponse;
import co.elastic.clients.elasticsearch.core.CountRequest;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient;
import co.elastic.clients.transport.endpoints.BooleanResponse;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_search.client.AnimeBrief;
import com.sanye.anime.sanye_search.client.AnimeClient;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnimeIndexServiceTest {

    private final ElasticsearchClient es = mock(ElasticsearchClient.class);
    private final ElasticsearchIndicesClient indices = mock(ElasticsearchIndicesClient.class);
    private final AnimeClient animeClient = mock(AnimeClient.class);
    private final AnimeIndexService service = new AnimeIndexService(es, animeClient, "sanye_anime");

    @Test
    void ensureIndexCreatesWhenMissing() throws Exception {
        when(es.indices()).thenReturn(indices);
        BooleanResponse exists = mock(BooleanResponse.class);
        when(exists.value()).thenReturn(false);
        when(indices.exists(any(Function.class))).thenReturn(exists);

        service.ensureIndex();

        verify(indices).create(any(CreateIndexRequest.class));
    }

    @Test
    void ensureIndexSkipsWhenExists() throws Exception {
        when(es.indices()).thenReturn(indices);
        BooleanResponse exists = mock(BooleanResponse.class);
        when(exists.value()).thenReturn(true);
        when(indices.exists(any(Function.class))).thenReturn(exists);

        service.ensureIndex();

        verify(indices, org.mockito.Mockito.never()).create(any(CreateIndexRequest.class));
    }

    @Test
    void countDelegates() throws Exception {
        CountResponse count = mock(CountResponse.class);
        when(count.count()).thenReturn(5L);
        when(es.count(any(Function.class))).thenReturn(count);

        assertEquals(5L, service.count());
    }

    @Test
    void syncAllIndexesFetchedPages() throws Exception {
        AnimeBrief brief = new AnimeBrief(1, "星海回声", "城市回声", "原创动画", 2025, 9.2,
                "已发布", "/covers/anime-1.svg", List.of("科幻"), "周三 22:00 更新");
        when(animeClient.list(1, 50))
                .thenReturn(new ApiResponse<>(0, "ok", PageResult.of(List.of(brief), 1, 50, 1), "rid"));
        BulkResponse bulk = mock(BulkResponse.class);
        when(bulk.errors()).thenReturn(false);
        when(bulk.items()).thenReturn(List.of());
        when(es.bulk(any(BulkRequest.class))).thenReturn(bulk);

        int indexed = service.syncAll();

        assertEquals(1, indexed);
        verify(es).bulk(any(BulkRequest.class));
    }
}
