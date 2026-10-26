package com.sanye.anime.sanye_search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.io.IOException;

class SubscriptionFetchServiceTest {
    @Test
    void preservesJsonTextAndRejectsNonJsonOrMultipleDocuments() {
        String content = "{\"exportedMediaSourceDataList\":{\"mediaSources\":[]}}";
        assertEquals(content, new SubscriptionFetchService(new ObjectMapper(), url -> content).fetch("https://public.example/sub.json"));
        for (String invalid : new String[]{"<html>error</html>", "null", "\"text\"", "{} {}", "{unquoted:1}", ""}) {
            assertThrows(BusinessException.class, () ->
                    new SubscriptionFetchService(new ObjectMapper(), url -> invalid).fetch("https://public.example/sub.json"));
        }
        assertThrows(BusinessException.class, () -> new SubscriptionFetchService(new ObjectMapper(), url -> {
            throw new IOException("网络连接失败");
        }).fetch("https://public.example/sub.json"));
    }

    @Test
    void controllerReturnsContentAndRequestIdWithoutExecutingScripts() {
        var service = mock(SubscriptionFetchService.class);
        var request = mock(HttpServletRequest.class);
        when(service.fetch("https://public.example/a.json")).thenReturn("{\"script\":\"not executed\"}");
        when(request.getAttribute(RequestIdFilter.ATTRIBUTE)).thenReturn("rid-subscription");
        var response = new SubscriptionController(service, request).fetch("https://public.example/a.json");
        assertEquals(0, response.code());
        assertEquals("rid-subscription", response.requestId());
        assertEquals("{\"script\":\"not executed\"}", response.data().get("content"));
        verify(service).fetch("https://public.example/a.json");
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfSystemProperty(named = "sanye.subscription.live", matches = "true")
    void readsRequestedLiveSubscriptions() {
        var service = new SubscriptionFetchService(new ObjectMapper());
        for (String name : new String[]{"css1", "bt1"}) {
            String content = service.fetch("https://sub.creamycake.org/v1/" + name + ".json");
            assertTrue(content.contains("exportedMediaSourceDataList"));
        }
    }
}
