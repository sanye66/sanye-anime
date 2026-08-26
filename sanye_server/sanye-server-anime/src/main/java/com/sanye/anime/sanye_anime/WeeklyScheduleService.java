package com.sanye.anime.sanye_anime;

import org.springframework.stereotype.Service;
import com.sanye.anime.sanye_anime.store.AnimeCatalogStore;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 一周排期服务（T-D-05）：解析作品更新文案生成按周分组的排期，仅返回已发布作品。
 * 数据面与 AnimeMemoryStore 解耦：正式接入 PG 内容表后保持同一接口契约。
 */
@Service
public class WeeklyScheduleService {

    public record ScheduleItem(long animeId, String title, String time, String episode,
                               String description, String state, String tone) {
    }

    public record ScheduleDay(String day, String label, List<ScheduleItem> items) {
    }

    public record WeeklySchedule(String generatedAt, List<ScheduleDay> days, int total) {
    }

    /**
     * 匹配“周三 22:00 更新”形态的更新文案；周一至周日 + “周天”容错。
     */
    private static final Pattern UPDATE_PATTERN = Pattern.compile(
            "周([一二三四五六日天])[\\s　]*(\\d{1,2}):(\\d{2})[\\s　]*更新");

    private static final Map<String, String> DAY_KEY_BY_CN = Map.of(
            "一", "monday", "二", "tuesday", "三", "wednesday", "四", "thursday",
            "五", "friday", "六", "saturday", "日", "sunday", "天", "sunday");

    private static final List<String> DAY_ORDER = List.of(
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday");

    private static final Map<String, String> DAY_LABEL = Map.of(
            "monday", "周一", "tuesday", "周二", "wednesday", "周三", "thursday", "周四",
            "friday", "周五", "saturday", "周六", "sunday", "周日");

    /**
     * 一季起点（2026-03-02 为周一），用于确定性地推导当前更新集数。
     */
    private static final LocalDate SEASON_START = LocalDate.of(2026, 3, 2);

    private static final int MAX_EPISODE = 26;
    private static final String[] TONES = {"blue", "coral", "gold"};

    private final AnimeCatalogStore catalogStore;

    /** 注入目录存储，排期只从已发布作品生成。 */
    public WeeklyScheduleService(AnimeCatalogStore catalogStore) {
        this.catalogStore = catalogStore;
    }

    /**
     * 生成一周排期：周一至周日固定顺序，未播作品按更新时间排序，仅包含已发布作品。
     */
    public WeeklySchedule week() {
        LocalDate today = LocalDate.now();
        LocalTime now = LocalTime.now();
        Map<String, List<ScheduleItem>> grouped = new LinkedHashMap<>();
        DAY_ORDER.forEach(day -> grouped.put(day, new ArrayList<>()));

        for (AnimeMemoryStore.AnimeCard card : catalogStore.publishedCards()) {
            Matcher matcher = UPDATE_PATTERN.matcher(card.updateText());
            if (!matcher.find()) {
                continue;
            }
            String dayKey = DAY_KEY_BY_CN.get(matcher.group(1));
            String time = matcher.group(2) + ":" + matcher.group(3);
            int dayIndex = DAY_ORDER.indexOf(dayKey);
            String state = isTodayAired(dayIndex, time, today, now) ? "已播出" : "待播出";
            grouped.get(dayKey).add(new ScheduleItem(
                    card.id(), card.title(), time, episodeText(card.id(), dayIndex, today),
                    card.summaryOf(), state, TONES[(int) (card.id() % TONES.length)]));
        }

        List<ScheduleDay> days = DAY_ORDER.stream()
                .map(day -> new ScheduleDay(day, DAY_LABEL.get(day), sortedByTime(grouped.get(day))))
                .toList();
        int total = days.stream().mapToInt(day -> day.items().size()).sum();
        return new WeeklySchedule(today.toString(), days, total);
    }

    /** 判断排期是否为今天且已经过播出时间。 */
    private boolean isTodayAired(int dayIndex, String time, LocalDate today, LocalTime now) {
        boolean sameDay = today.getDayOfWeek().getValue() == dayIndex + 1;
        return sameDay && LocalTime.parse(time).isBefore(now);
    }

    /** 按 HH:mm 对同一天的节目进行稳定排序。 */
    private List<ScheduleItem> sortedByTime(List<ScheduleItem> items) {
        return items.stream()
                .sorted(Comparator.comparing(ScheduleItem::time))
                .toList();
    }

    /**
     * 从一季起点按周推导集数（1-26 封顶），保证同一天内稳定可预期。
     */
    private String episodeText(long animeId, int dayIndex, LocalDate today) {
        int offset = (dayIndex - SEASON_START.getDayOfWeek().getValue() + 7) % 7;
        LocalDate firstAir = SEASON_START.plusDays(offset);
        long weeks = Math.max(ChronoUnit.WEEKS.between(firstAir, today), 0);
        int episode = (int) Math.min(weeks + 1, MAX_EPISODE);
        return "第 " + episode + " 集";
    }
}
