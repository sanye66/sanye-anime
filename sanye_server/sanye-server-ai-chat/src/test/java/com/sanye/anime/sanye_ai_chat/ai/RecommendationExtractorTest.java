package com.sanye.anime.sanye_ai_chat.ai;

import com.sanye.anime.sanye_ai_chat.client.AnimeBrief;
import com.sanye.anime.sanye_ai_chat.client.AnimeClient;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_core.web.ApiResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationExtractorTest {

    private final AnimeClient animeClient = mock(AnimeClient.class);
    private final RecommendationExtractor extractor = new RecommendationExtractor(animeClient);

    @Test
    void noRecommendationIntentReturnsEmpty() {
        assertTrue(extractor.extract("这部作品的结局是什么", 1L).isEmpty());
    }

    @Test
    void excludesCurrentAnimeAndLimitsToTwo() {
        when(animeClient.getAnime(anyLong())).thenReturn(new ApiResponse<>(0, "ok",
                new AnimeBrief(133, "无职转生 · 第一季", "已发布"), "rid"));
        List<RecommendationView> recs = extractor.extract("推荐一些好看的动漫", 133L);
        assertEquals(2, recs.size());
        assertFalse(recs.stream().anyMatch(r -> r.animeId() == 133L));
    }

    @Test
    void fallsBackToStaticPoolWhenAnimeServiceDown() {
        when(animeClient.getAnime(anyLong())).thenThrow(new RuntimeException("anime down"));
        List<RecommendationView> recs = extractor.extract("推荐一些好看的动漫", 127L);
        assertEquals(2, recs.size());
        assertEquals("无职转生 · 第一季", recs.get(0).title());
    }

    @Test
    void usesRemoteTitleWhenVerified() {
        when(animeClient.getAnime(133L)).thenReturn(new ApiResponse<>(0, "ok",
                new AnimeBrief(133, "无职转生 · 第一季", "已发布"), "rid"));
        when(animeClient.getAnime(136L)).thenReturn(new ApiResponse<>(0, "ok",
                new AnimeBrief(136, "无职转生 · 第二季", "已发布"), "rid"));
        List<RecommendationView> recs = extractor.extract("推荐一些好看的动漫", 127L);
        assertEquals(2, recs.size());
        assertTrue(recs.stream().allMatch(r -> r.animeId() == 133L || r.animeId() == 136L));
    }

    @Test
    void verifyStrictDropsUnpublishedAndUnknown() {
        when(animeClient.getAnime(133L)).thenReturn(new ApiResponse<>(0, "ok",
                new AnimeBrief(133, "无职转生 · 第一季", "已发布"), "rid"));
        when(animeClient.getAnime(7L)).thenReturn(new ApiResponse<>(2003, "不存在", null, "rid"));
        when(animeClient.getAnime(8L)).thenReturn(new ApiResponse<>(0, "ok",
                new AnimeBrief(8, "下架作品", "DRAFT"), "rid"));
        List<RecommendationView> verified = extractor.verifyStrict(List.of(
                new RecommendationView(133, "无职转生 · 第一季", "a"),
                new RecommendationView(7, "不存在", "b"),
                new RecommendationView(8, "下架作品", "c")));
        assertEquals(1, verified.size());
        assertEquals(133, verified.get(0).animeId());
    }

    @Test
    void verifyStrictReturnsEmptyWhenAnimeServiceDown() {
        when(animeClient.getAnime(anyLong())).thenThrow(new RuntimeException("down"));
        assertTrue(extractor.verifyStrict(List.of(
                new RecommendationView(133, "无职转生 · 第一季", "a"))).isEmpty());
    }
}
