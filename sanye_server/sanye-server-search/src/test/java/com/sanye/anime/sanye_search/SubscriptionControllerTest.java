package com.sanye.anime.sanye_search;

import com.sanye.anime.sanye_search.model.ExternalSearchHitView;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SubscriptionControllerTest {
    @Test
    void subscriptionEndpointsUseTheClientEnvelopeAndLazyEpisodeContract() throws Exception {
        var playback = mock(SubscriptionPlaybackService.class);
        when(playback.search("config", "作品", null, 1)).thenReturn(List.of(
                new ExternalSearchHitView("作品", "https://public.example/detail", "", "主线", "anime")));
        when(playback.preview("config", "https://public.example/detail", "作品", 1)).thenReturn(
                new SubscriptionPlaybackService.Preview("作品", "https://public.example/detail", List.of(), "anime",
                        List.of(new SubscriptionPlaybackService.Episode(1L, 1, "第1集",
                                "https://public.example/play/1", "", "", "主线")), List.of()));
        when(playback.resolve("config", "https://public.example/play/1", 1)).thenReturn(
                new SubscriptionPlaybackService.Playback("https://public.example/video.mp4", "video/mp4", List.of()));
        var controller = new SubscriptionController(mock(SubscriptionFetchService.class), mock(HttpServletRequest.class), playback);
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/search/subscription/search").contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"config\",\"keyword\":\"作品\",\"sourceIndex\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].sourceUrl").value("https://public.example/detail"));
        mvc.perform(post("/api/v1/search/subscription/preview").contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"config\",\"sourceUrl\":\"https://public.example/detail\",\"title\":\"作品\",\"sourceIndex\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.episodes[0].playbackUrl").value(""))
                .andExpect(jsonPath("$.data.episodes[0].sourcePageUrl").value("https://public.example/play/1"));
        mvc.perform(post("/api/v1/search/subscription/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"config\",\"sourceUrl\":\"https://public.example/play/1\",\"sourceIndex\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.url").value("https://public.example/video.mp4"))
                .andExpect(jsonPath("$.data.mimeType").value("video/mp4"));
    }
}
