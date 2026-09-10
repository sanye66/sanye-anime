package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnimeCatalogServiceTest {

    private final AnimeCatalogService service = new AnimeCatalogService(new InMemoryAnimeCatalogStore());

    @BeforeEach
    void resetCatalog() {
        AnimeMemoryStore.resetForTest();
    }

    @Test
    void listAllReturnsPublishedOnly() {
        PageResult<AnimeMemoryStore.AnimeCard> result = service.list(null, null, null, null, null, 1, 20);
        assertEquals(15, result.items().size());
        assertTrue(result.items().stream().allMatch(card -> card.status().equals("已发布")));
    }

    @Test
    void keywordMatchesTitleButNotTags() {
        PageResult<AnimeMemoryStore.AnimeCard> byTitle = service.list("星海", null, null, null, null, 1, 20);
        assertEquals(1, byTitle.items().size());
        assertEquals("星海回声", byTitle.items().get(0).title());

        PageResult<AnimeMemoryStore.AnimeCard> byTag = service.list("悬疑", null, null, null, null, 1, 20);
        assertTrue(byTitle.total() > 0);
        assertEquals(0, byTag.total());
    }

    @Test
    void typeFilterWorks() {
        PageResult<AnimeMemoryStore.AnimeCard> result = service.list(null, "剧场版", null, null, null, 1, 20);
        assertTrue(result.total() >= 2);
        assertTrue(result.items().stream().allMatch(card -> card.type().equals("剧场版")));
    }

    @Test
    void statusFilterMapsChineseLabels() {
        PageResult<AnimeMemoryStore.AnimeCard> airing = service.list(null, null, "连载中", null, null, 1, 50);
        assertTrue(airing.total() >= 7);
        assertTrue(airing.items().stream().allMatch(card -> card.updateText().contains("更新")));

        PageResult<AnimeMemoryStore.AnimeCard> finished = service.list(null, null, "已完结", null, null, 1, 50);
        assertTrue(finished.total() >= 5);
        assertTrue(finished.items().stream().allMatch(card -> card.updateText().equals("已完结")));
    }

    @Test
    void missingUpdateTextRemainsReadableWithoutInventingScheduleOrStatus() {
        var card = new AnimeMemoryStore.AnimeCard(91004L, "recovery-null", "", "TV", 2026, 0,
                "已发布", "", List.of(), null);
        AnimeMemoryStore.addCard(card, "recovery");
        assertEquals(1, service.list("recovery-null", null, null, null, null, 1, 50).total());
        assertEquals(0, service.list("recovery-null", null, "连载中", null, null, 1, 50).total());
        assertEquals(0, service.list("recovery-null", null, "已完结", null, null, 1, 50).total());
        assertEquals(1, service.list("recovery-null", null, "已发布", null, null, 1, 50).total());
        assertTrue(service.detail(card.id()).schedule().isEmpty());
    }

    @Test
    void yearAndYearBeforeFilter() {
        PageResult<AnimeMemoryStore.AnimeCard> exact = service.list(null, null, null, 2025, null, 1, 50);
        assertTrue(exact.total() >= 4);
        assertTrue(exact.items().stream().allMatch(card -> card.year() == 2025));

        PageResult<AnimeMemoryStore.AnimeCard> before = service.list(null, null, null, null, 2022, 1, 50);
        assertTrue(before.total() >= 1);
        assertTrue(before.items().stream().allMatch(card -> card.year() <= 2022));
    }

    @Test
    void paginationCalculatesPages() {
        PageResult<AnimeMemoryStore.AnimeCard> page1 = service.list(null, null, null, null, null, 1, 6);
        assertEquals(6, page1.items().size());
        assertEquals(15, page1.total());
        assertEquals(3, page1.totalPages());

        PageResult<AnimeMemoryStore.AnimeCard> page3 = service.list(null, null, null, null, null, 3, 6);
        assertEquals(3, page3.items().size());
    }

    @Test
    void detailIncludesCharactersSimilarAndSchedule() {
        AnimeMemoryStore.AnimeDetail detail = service.detail(1);
        assertEquals("星海回声", detail.title());
        assertEquals(3, detail.characters().size());
        assertEquals(3, detail.similar().size());
        assertTrue(detail.schedule().size() >= 3);
        assertTrue(detail.similar().stream().noneMatch(card -> card.id() == 1));
    }
}
