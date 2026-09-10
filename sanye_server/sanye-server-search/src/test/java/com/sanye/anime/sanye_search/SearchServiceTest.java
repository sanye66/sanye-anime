package com.sanye.anime.sanye_search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.HitsMetadata;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_search.client.AnimeBrief;
import com.sanye.anime.sanye_search.client.AnimeClient;
import com.sanye.anime.sanye_search.model.SearchDoc;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SearchServiceTest {

    private final AnimeClient animeClient = mock(AnimeClient.class);

    @Test
    void desktopCatalogSearchDoesNotConnectToElasticsearch() {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        SearchService service = new SearchService(es, animeClient, "unused");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "catalogOnly", true);
        when(animeClient.search("local", null, null, null, null, 1, 20))
                .thenReturn(ApiResponse.ok(PageResult.of(List.of(), 1, 20, 0), "desktop"));
        assertEquals(0, service.search("local", null, null, null, null, 1, 20).total());
        org.mockito.Mockito.verifyNoInteractions(es);
    }

    @Test
    void searchDegradesWhenEsUnavailable() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        doThrow(new IOException("es down")).when(es).search(any(Function.class), any(Class.class));
        SearchService service = new SearchService(es, animeClient, "sanye_anime");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.search("星海", null, null, null, null, 1, 10));
        assertEquals(ErrorCode.SEARCH_UNAVAILABLE, ex.errorCode());
    }

    @Test
    void searchRejectsOversizedKeyword() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        SearchService service = new SearchService(es, animeClient, "sanye_anime");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.search("x".repeat(51), null, null, null, null, 1, 10));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void searchRejectsBlankKeyword() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        SearchService service = new SearchService(es, animeClient, "sanye_anime");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.search(null, null, null, null, null, 1, 10));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    @SuppressWarnings("unchecked")
    void zeroHitIndexFallsBackToAnimeCatalog() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        SearchResponse<SearchDoc> response = mock(SearchResponse.class);
        HitsMetadata<SearchDoc> hits = mock(HitsMetadata.class);
        when(response.hits()).thenReturn(hits);
        when(hits.hits()).thenReturn(List.of());
        when(hits.total()).thenReturn(null);
        when(es.search(any(Function.class), eq(SearchDoc.class))).thenReturn(response);
        AnimeBrief brief = new AnimeBrief(139, "天气之子", "Weathering with You", "剧场版", 2019,
                8.8, "已发布", "/covers/weathering.jpg", List.of("爱情"), "已完结");
        when(animeClient.search("天气之子", null, null, null, null, 1, 20))
                .thenReturn(ApiResponse.ok(PageResult.of(List.of(brief), 1, 20, 1), "rid"));
        SearchService service = new SearchService(es, animeClient, "sanye_anime");

        var result = service.search("天气之子", null, null, null, null, 1, 20);

        assertEquals(1, result.total());
        assertEquals(139, result.items().get(0).id());
    }

    @Test
    @SuppressWarnings("unchecked")
    void exactAliasExpandsCatalogFallbackAndKeepsOriginalMatches() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        SearchResponse<SearchDoc> response = mock(SearchResponse.class);
        HitsMetadata<SearchDoc> hits = mock(HitsMetadata.class);
        when(response.hits()).thenReturn(hits);
        when(hits.hits()).thenReturn(List.of());
        when(hits.total()).thenReturn(null);
        when(es.search(any(Function.class), eq(SearchDoc.class))).thenReturn(response);
        AnimeBrief brief = new AnimeBrief(200, "我的青春恋爱物语果然有问题", "やはり俺の青春ラブコメはまちがっている。",
                "电视动画", 2013, 9.0, "已发布", "/covers/oregairu.jpg", List.of("恋爱"), "已完结");
        when(animeClient.search("我的青春恋爱物语果然有问题", null, null, null, null, 1, 20))
                .thenReturn(ApiResponse.ok(PageResult.of(List.of(brief), 1, 20, 1), "rid"));
        AnimeBrief originalMatch = new AnimeBrief(201, "战勇OVA：学园战勇，青春物语", "",
                "电视动画", 2013, 7.0, "已发布", "/covers/senyu.jpg", List.of(), "已完结");
        when(animeClient.search("春物", null, null, null, null, 1, 20))
                .thenReturn(ApiResponse.ok(PageResult.of(List.of(originalMatch), 1, 20, 1), "rid"));
        SearchService service = new SearchService(es, animeClient, "sanye_anime");

        var result = service.search("春物", null, null, null, null, 1, 20);

        assertEquals(2, result.total());
        assertEquals("我的青春恋爱物语果然有问题", result.items().get(0).title());
        assertEquals("战勇OVA：学园战勇，青春物语", result.items().get(1).title());
    }

    @Test
    void strictMatchUsesOnlyTitleAndOriginalTitle() {
        SearchDoc doc = new SearchDoc(1, "天气之子", "Weathering with You", "剧场版", 2019,
                8.8, "已发布", "/cover.jpg", List.of("爱情"), "已完结", "包含无职转生的摘要");

        assertTrue(SearchService.matchesTitle(doc, "天气 之子"));
        assertTrue(SearchService.matchesTitle(doc, "weathering-with-you"));
        assertFalse(SearchService.matchesTitle(doc, "无职转生"));
        assertFalse(SearchService.matchesTitle(doc, "爱情"));
        SearchDoc oregairu = new SearchDoc(2, "我的青春恋爱物语果然有问题", "やはり俺の青春ラブコメはまちがっている。",
                "电视动画", 2013, 9.0, "已发布", "/cover.jpg", List.of(), "已完结", "");
        assertTrue(SearchService.matchesTitle(oregairu, "春物"));
        SearchDoc originalMatch = new SearchDoc(3, "战勇OVA：学园战勇，青春物语", "",
                "电视动画", 2013, 7.0, "已发布", "/cover.jpg", List.of(), "已完结", "");
        assertTrue(SearchService.matchesTitle(originalMatch, "春物"));
    }
}
