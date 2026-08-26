package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WeeklyScheduleServiceTest {

    private final WeeklyScheduleService service = new WeeklyScheduleService(new InMemoryAnimeCatalogStore());

    @BeforeEach
    void resetCatalog() {
        AnimeMemoryStore.resetForTest();
    }

    @Test
    void weekReturnsSevenDaysInOrder() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        assertEquals(7, week.days().size());
        assertEquals(List.of("monday", "tuesday", "wednesday", "thursday",
                "friday", "saturday", "sunday"),
                week.days().stream().map(WeeklyScheduleService.ScheduleDay::day).toList());
        assertEquals(7, week.total());
    }

    @Test
    void parsesUpdateTextIntoCorrectDayAndTime() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        WeeklyScheduleService.ScheduleDay wednesday = week.days().stream()
                .filter(day -> day.day().equals("wednesday"))
                .findFirst()
                .orElseThrow();
        assertEquals(1, wednesday.items().size());
        WeeklyScheduleService.ScheduleItem item = wednesday.items().get(0);
        assertEquals("星海回声", item.title());
        assertEquals("22:00", item.time());
        assertEquals(1, item.animeId());
    }

    @Test
    void finishedAndTheaterAnimeAreExcluded() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        List<String> titles = week.days().stream()
                .flatMap(day -> day.items().stream())
                .map(WeeklyScheduleService.ScheduleItem::title)
                .toList();
        assertFalse(titles.contains("夏末余晖"), "已完结作品不应出现在排期");
        assertFalse(titles.contains("纸月计划"), "剧场版作品不应出现在排期");
        assertFalse(titles.contains("星屑列车"), "剧场版作品不应出现在排期");
    }

    @Test
    void unpublishedAnimeIsExcluded() {
        InMemoryAnimeCatalogStore store = new InMemoryAnimeCatalogStore();
        WeeklyScheduleService localService = new WeeklyScheduleService(store);
        store.updateStatus(1, "已下架");
        WeeklyScheduleService.WeeklySchedule week = localService.week();
        List<WeeklyScheduleService.ScheduleItem> items = week.days().stream()
                .flatMap(day -> day.items().stream())
                .toList();
        assertEquals(6, items.size());
        assertTrue(items.stream().noneMatch(item -> item.animeId() == 1));
        store.updateStatus(1, "已发布");
    }

    @Test
    void episodeIsDeterministicAndWithinRange() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        List<WeeklyScheduleService.ScheduleItem> items = week.days().stream()
                .flatMap(day -> day.items().stream())
                .toList();
        for (WeeklyScheduleService.ScheduleItem item : items) {
            assertTrue(item.episode().matches("第 \\d{1,2} 集"), item.episode());
            int episode = Integer.parseInt(item.episode().replaceAll("\\D", ""));
            assertTrue(episode >= 1 && episode <= 26, "集数应在 1-26 之间：" + item.episode());
        }
    }

    @Test
    void eachDayItemsAreSortedByTime() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        for (WeeklyScheduleService.ScheduleDay day : week.days()) {
            List<String> times = day.items().stream()
                    .map(WeeklyScheduleService.ScheduleItem::time)
                    .toList();
            assertEquals(times.stream().sorted().toList(), times, day.day() + " 应按时间升序");
        }
    }

    @Test
    void toneAndStateAreStable() {
        WeeklyScheduleService.WeeklySchedule week = service.week();
        WeeklyScheduleService.ScheduleItem item = week.days().stream()
                .filter(day -> day.day().equals("monday"))
                .findFirst()
                .orElseThrow()
                .items()
                .get(0);
        assertEquals("山海之间", item.title());
        assertTrue(item.tone().matches("blue|coral|gold"));
        assertTrue(item.state().equals("已播出") || item.state().equals("待播出"));
        assertTrue(item.description().length() > 10, "应携带作品简介");
    }
}
