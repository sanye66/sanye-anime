package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnimeCatalogStoreTest {

    private final InMemoryAnimeCatalogStore store = new InMemoryAnimeCatalogStore();

    @BeforeEach
    void resetCatalog() {
        AnimeMemoryStore.resetForTest();
    }

    @Test
    void buildScheduleBuildsThreeEpisodesForAiring() {
        AnimeMemoryStore.AnimeCard airing = store.allCards().stream()
                .filter(card -> card.updateText().contains("更新"))
                .findFirst()
                .orElseThrow();
        List<AnimeMemoryStore.AnimeSchedule> schedule = store.buildSchedule(airing);
        assertEquals(3, schedule.size());
        assertEquals("AIRING", schedule.get(0).status());
        assertEquals("PLANNED", schedule.get(1).status());
    }

    @Test
    void buildScheduleEmptyForFinished() {
        AnimeMemoryStore.AnimeCard finished = store.allCards().stream()
                .filter(card -> card.updateText().equals("已完结"))
                .findFirst()
                .orElseThrow();
        assertTrue(store.buildSchedule(finished).isEmpty());
    }

    @Test
    void publishedCardsFiltersByStatus() {
        assertEquals(15, store.publishedCards().size());
        store.updateStatus(1, "已下架");
        assertEquals(14, store.publishedCards().size());
        assertFalse(store.isPublished(1));
        store.updateStatus(1, "已发布");
        assertTrue(store.isPublished(1));
    }

    @Test
    void summaryByIdMapsAllCards() {
        assertEquals(15, store.summaryById().size());
        assertTrue(store.summaryById().get(1L).contains("漂浮城市群"));
    }
}
