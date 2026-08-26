package com.sanye.anime.sanye_ai_chat.rag;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import dev.langchain4j.rag.content.Content;
import dev.langchain4j.rag.query.Query;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

class AnimeContentRetrieverTest {

    @Test
    void retrieveReturnsEmptyWhenEsUnavailable() throws Exception {
        ElasticsearchClient es = mock(ElasticsearchClient.class);
        doThrow(new IOException("es down")).when(es).search(any(SearchRequest.class), any(Class.class));
        AnimeContentRetriever retriever = new AnimeContentRetriever(es, "sanye_anime", 3);

        List<Content> contents = retriever.retrieve(new Query("星海回声"));

        assertTrue(contents.isEmpty(), "ES 不可用时 RAG 检索应返回空列表（不阻塞回答）");
    }
}
