package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.CountResponse;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient;
import co.elastic.clients.elasticsearch.indices.GetAliasResponse;
import co.elastic.clients.elasticsearch.indices.UpdateAliasesRequest;
import co.elastic.clients.elasticsearch.indices.UpdateAliasesResponse;
import co.elastic.clients.transport.endpoints.BooleanResponse;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_search.client.AnimeBrief;
import com.sanye.anime.sanye_search.client.AnimeClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnimeIndexServiceTest {

    private final ElasticsearchClient es = mock(ElasticsearchClient.class);
    private final ElasticsearchIndicesClient indices = mock(ElasticsearchIndicesClient.class);
    private final AnimeClient animeClient = mock(AnimeClient.class);
    private final AnimeIndexService service = new AnimeIndexService(es, animeClient, "sanye_anime");

    @BeforeEach
    void useIndicesClient() {
        when(es.indices()).thenReturn(indices);
    }

    @Test
    void ensureIndexCreatesWhenMissing() throws Exception {
        BooleanResponse exists = mock(BooleanResponse.class);
        when(exists.value()).thenReturn(false);
        when(indices.exists(any(Function.class))).thenReturn(exists);

        service.ensureIndex();

        verify(indices).create(any(CreateIndexRequest.class));
    }

    @Test
    void ensureIndexSkipsWhenExists() throws Exception {
        BooleanResponse exists = mock(BooleanResponse.class);
        when(exists.value()).thenReturn(true);
        when(indices.exists(any(Function.class))).thenReturn(exists);

        service.ensureIndex();

        verify(indices, never()).create(any(CreateIndexRequest.class));
    }

    @Test
    void countDelegates() throws Exception {
        CountResponse count = mock(CountResponse.class);
        when(count.count()).thenReturn(5L);
        when(es.count(any(Function.class))).thenReturn(count);

        assertEquals(5L, service.count());
    }

    @Test
    void rebuildSwitchesAliasAfterCandidateValidationWithoutDeletingOldIndex() throws Exception {
        AnimeBrief brief = published(1);
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(brief), 1, 1));
        successfulBulk();
        candidateCount(1);
        UpdateAliasesResponse update = mock(UpdateAliasesResponse.class);
        when(update.acknowledged()).thenReturn(true);
        when(indices.updateAliases(any(UpdateAliasesRequest.class))).thenReturn(update);

        assertEquals(1, service.rebuild());

        ArgumentCaptor<UpdateAliasesRequest> request = ArgumentCaptor.forClass(UpdateAliasesRequest.class);
        verify(indices).updateAliases(request.capture());
        assertEquals(2, request.getValue().actions().size());
        var remove = request.getValue().actions().get(0).remove();
        var add = request.getValue().actions().get(1).add();
        assertEquals("sanye_anime_previous", remove.index());
        assertEquals("sanye_anime", remove.alias());
        assertTrue(add.index().startsWith("sanye_anime_"));
        assertFalse("sanye_anime_previous".equals(add.index()));
        assertEquals("sanye_anime", add.alias());
        assertEquals(Boolean.TRUE, add.isWriteIndex());
        verify(indices, never()).delete(any(Function.class));
    }

    @Test
    void rebuildDoesNotSwitchAliasWhenSourceFails() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(null);

        assertThrows(IOException.class, service::rebuild);

        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void rebuildDoesNotSwitchAliasWhenBulkReportsErrors() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(published(1)), 1, 1));
        BulkResponse bulk = mock(BulkResponse.class);
        when(bulk.errors()).thenReturn(true);
        when(es.bulk(any(BulkRequest.class))).thenReturn(bulk);

        assertThrows(IOException.class, service::rebuild);

        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void rebuildDoesNotSwitchAliasWhenCandidateCountDiffers() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(published(1)), 1, 1));
        successfulBulk();
        candidateCount(0);

        assertThrows(IOException.class, service::rebuild);

        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void rebuildRejectsRepeatedSourceDataWithoutSwitchingAlias() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(published(1), published(1)), 1, 2));

        assertThrows(IOException.class, service::rebuild);

        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void rebuildRejectsIncompleteSourceDataWithoutSwitchingAlias() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(published(1)), 1, 2));
        when(animeClient.list(2, 50)).thenReturn(page(List.of(), 2, 2));
        successfulBulk();

        assertThrows(IOException.class, service::rebuild);

        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void rebuildAcceptsAnEmptyDirectoryAndSwitchesAlias() throws Exception {
        prepareAlias("sanye_anime_previous");
        when(animeClient.list(1, 50)).thenReturn(page(List.of(), 1, 0));
        candidateCount(0);
        UpdateAliasesResponse update = mock(UpdateAliasesResponse.class);
        when(update.acknowledged()).thenReturn(true);
        when(indices.updateAliases(any(UpdateAliasesRequest.class))).thenReturn(update);

        assertEquals(0, service.rebuild());

        verify(indices).updateAliases(any(UpdateAliasesRequest.class));
        verify(es, never()).bulk(any(BulkRequest.class));
    }

    private void prepareAlias(String oldIndex) throws IOException {
        BooleanResponse exists = mock(BooleanResponse.class);
        when(exists.value()).thenReturn(true);
        when(indices.existsAlias(any(Function.class))).thenReturn(exists);
        GetAliasResponse aliases = mock(GetAliasResponse.class);
        when(aliases.result()).thenReturn(Map.of(oldIndex,
                mock(co.elastic.clients.elasticsearch.indices.get_alias.IndexAliases.class)));
        when(indices.getAlias(any(Function.class))).thenReturn(aliases);
    }

    private void successfulBulk() throws IOException {
        BulkResponse bulk = mock(BulkResponse.class);
        when(bulk.errors()).thenReturn(false);
        when(es.bulk(any(BulkRequest.class))).thenReturn(bulk);
    }

    private void candidateCount(long value) throws IOException {
        CountResponse count = mock(CountResponse.class);
        when(count.count()).thenReturn(value);
        when(es.count(any(Function.class))).thenReturn(count);
    }

    private AnimeBrief published(long id) {
        return new AnimeBrief(id, "星海回声", "城市回声", "原创动画", 2025, 9.2,
                "已发布", "/covers/anime-" + id + ".svg", List.of("科幻"), "周三 22:00 更新");
    }

    private ApiResponse<PageResult<AnimeBrief>> page(List<AnimeBrief> items, int page, long total) {
        return new ApiResponse<>(0, "ok", PageResult.of(items, page, 50, total), "rid");
    }
}
