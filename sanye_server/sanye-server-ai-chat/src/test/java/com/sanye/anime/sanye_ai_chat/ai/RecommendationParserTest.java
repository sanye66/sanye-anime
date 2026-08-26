package com.sanye.anime.sanye_ai_chat.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecommendationParserTest {

    private final RecommendationParser parser = new RecommendationParser(new ObjectMapper());

    @Test
    void parsesStandaloneJsonArray() {
        String json = "[{\"animeId\":3,\"title\":\"纸月计划\",\"reason\":\"近未来悬疑剧场版\"}]";
        List<RecommendationView> recs = parser.parse(json);
        assertEquals(1, recs.size());
        assertEquals(3, recs.get(0).animeId());
        assertEquals("纸月计划", recs.get(0).title());
    }

    @Test
    void parsesJsonBlockEmbeddedInText() {
        String text = "根据偏好，我推荐以下作品：\n[{\"animeId\":2,\"title\":\"夏末余晖\",\"reason\":\"治愈\"},"
                + "{\"animeId\":5,\"title\":\"向北的风\",\"reason\":\"公路\"}]\n希望你喜欢。";
        List<RecommendationView> recs = parser.parse(text);
        assertEquals(2, recs.size());
        assertEquals(2, recs.get(0).animeId());
        assertEquals(5, recs.get(1).animeId());
    }

    @Test
    void malformedJsonReturnsEmpty() {
        String malformed = "[{\"animeId\":3,\"title\":\"纸月计划\"";
        assertTrue(parser.parse(malformed).isEmpty());
    }

    @Test
    void plainTextWithoutArrayReturnsEmpty() {
        assertTrue(parser.parse("我推荐《纸月计划》和《星海回声》。").isEmpty());
        assertTrue(parser.parse("").isEmpty());
        assertTrue(parser.parse(null).isEmpty());
    }
}
