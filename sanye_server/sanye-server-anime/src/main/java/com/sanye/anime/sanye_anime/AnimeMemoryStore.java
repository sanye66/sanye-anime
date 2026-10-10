package com.sanye.anime.sanye_anime;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

/**
 * 联调用内存作品目录（dev 基线，正式生产替换为 PostgreSQL + 内容管理写入）。
 * 覆盖 T-D-02 列表筛选与 T-D-04 详情完善所需的最小数据面。
 */
public final class AnimeMemoryStore {

    public record AnimeCharacter(String name, String role) {
    }

    public record AnimeSchedule(int episodeNo, String airDate, String status) {
    }

    /** 播放页公开声明的一条媒体线路；只保存地址，不保存媒体二进制。 */
    public record AnimePlaybackOption(String url, String mimeType, String label) {
    }

    /** 作品剧集媒体元数据；只保存来源页和外部播放器地址，不保存媒体二进制。 */
    public record AnimeEpisode(long id, int episodeNo, String title, String sourcePageUrl,
                               String playbackUrl, String mimeType, String sourceLabel,
                               List<AnimePlaybackOption> playbackOptions) {

        /** 兼容数据库旧记录和现有调用方，单地址记录没有额外线路。 */
        public AnimeEpisode(long id, int episodeNo, String title, String sourcePageUrl,
                            String playbackUrl, String mimeType, String sourceLabel) {
            this(id, episodeNo, title, sourcePageUrl, playbackUrl, mimeType, sourceLabel, List.of());
        }

        public AnimeEpisode {
            playbackOptions = playbackOptions == null ? List.of() : List.copyOf(playbackOptions);
        }
    }

    public record AnimeCard(long id, String title, String originalTitle, String type, int year, double score,
                            String status, String coverUrl, List<String> tags, String updateText) {

        /** 根据标题读取联调简介，缺失时返回空串。 */
        public String summaryOf() {
            return SUMMARY.getOrDefault(title, "");
        }
    }

    public record AnimeDetail(long id, String title, String originalTitle, String type, int year, double score,
                              String status, String coverUrl, List<String> tags, String updateText,
                              String summary, boolean isFavorite, List<AnimeCharacter> characters,
                              List<AnimeCard> similar, List<AnimeSchedule> schedule, String source) {
    }

    public record HomeSection(String key, String title, List<AnimeCard> anime) {
    }

    public record HomeResponse(List<Object> banners, List<HomeSection> sections, List<Object> quickLinks) {
    }

    /**
     * 官网公开首页，与前端 public.ts 的 PublicHomeResponse 对齐。
     */
    public record PublicHomeResponse(List<AnimeCard> picks) {
    }

    private record Entry(long id, String title, String originalTitle, String type, int year, double score,
                         List<String> tags, String updateText, String summary, List<AnimeCharacter> characters,
                         String coverUrl) {
    }

    /** 静态内存数据容器禁止实例化。 */
    private AnimeMemoryStore() {
    }

    /** 正式内存回退目录：仅保留已导入的《你的名字》和无职转生五个独立篇章。 */
    private static final List<Entry> OFFICIAL_ENTRIES = List.of(
            officialEntry(127, "你的名字", "君の名は。", "剧场版", 2026, 9.1,
                    List.of("剧场版", "爱情", "奇幻"), "已完结",
                    "在远离大都会的小山村，两个素不相识的少年少女在梦中交换人生，并开始寻找彼此。",
                    List.of(), "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100635A046.jpg"),
            officialEntry(133, "无职转生 · 第一季", "无职转生：到了异世界就拿出真本事", "电视动画", 2026, 9.2,
                    List.of("异世界", "冒险", "成长"), "已完结",
                    "重新开始的人生，终于有机会认真生活并拿出真正的本事。",
                    List.of(), "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100607A039.jpg"),
            officialEntry(136, "无职转生 · 第二季", "无职转生Ⅱ～到了异世界就拿出真本事～", "电视动画", 2026, 9.3,
                    List.of("异世界", "冒险", "魔法"), "已完结",
                    "鲁迪乌斯继续在异世界前行，面对新的伙伴、选择与成长。",
                    List.of(), "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100612A042.jpg"),
            officialEntry(135, "无职转生 · 第二季 Part.2", "无职转生Ⅱ到了异世界就拿出真本事Part2", "电视动画", 2026, 9.1,
                    List.of("异世界", "冒险", "剧情"), "已完结",
                    "第二季后半篇章，新的旅程继续展开，重要的命运交汇即将到来。",
                    List.of(), "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100611A041.jpg"),
            officialEntry(128, "无职转生 · 第三季", "无职转生Ⅲ 到了异世界就拿出真本事 第三季", "电视动画", 2026, 9.4,
                    List.of("异世界", "冒险", "奇幻"), "周日 21:00 更新",
                    "异世界的新篇章已经开启，鲁迪乌斯将面对更大的舞台和挑战。",
                    List.of(), "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100559A034.jpg"),
            officialEntry(137, "无职转生 · OAD 特别篇", "无职转生：到了异世界就拿出真本事 OAD", "电视动画", 2026, 8.8,
                    List.of("异世界", "特别篇", "冒险"), "已完结",
                    "无职转生系列特别篇，补充主线旅程中的重要片段。",
                    List.of(), "/covers/mushoku-oad.svg"));

    /** 单元测试专用虚构目录，不参与默认运行和客户端失败回退。 */
    private static final List<Entry> TEST_ENTRIES = List.of(
            entry(1, "星海回声", "城市回声", "原创动画", 2025, 9.2, List.of("科幻", "冒险", "群像", "成长"),
                    "周三 22:00 更新", "在漂浮城市群之间，一支负责修复旧广播塔的少女小队，听见了来自失落地表的求救信号。",
                    List.of(ch("林澈", "广播塔修复小队队长"), ch("苏晚", "信号监听员"), ch("老周", "城市档案管理员"))),
            entry(2, "夏末余晖", "八月余晖", "电视动画", 2024, 8.8, List.of("青春", "治愈", "日常"),
                    "已完结", "转学后的最后一个夏天，两个不擅长告别的人决定把每个黄昏都记录下来。",
                    List.of(ch("叶栀", "转学生"), ch("陆遥", "摄影社成员"))),
            entry(3, "纸月计划", "纸月协议", "剧场版", 2025, 9.0, List.of("悬疑", "近未来", "心理"),
                    "剧场版", "当城市所有人的梦境开始共享，一个只在纸上存在的月亮成为破案的唯一线索。",
                    List.of(ch("孟知行", "梦境调查员"), ch("阿纸", "共享梦境观测员"))),
            entry(4, "蓝色时刻", "蓝色时刻", "电视动画", 2025, 8.6, List.of("奇幻", "冒险", "城市"),
                    "周五 21:30 更新", "只有在日落后的七分钟里，少年才能看见城市中被遗忘的另一面。",
                    List.of(ch("陈屿", "能看到另一面的少年"), ch("小蓝", "黄昏引路人"))),
            entry(5, "向北的风", "向北之风", "网络动画", 2025, 8.4, List.of("旅行", "温情", "公路"),
                    "周日 20:00 更新", "一辆没有固定终点的列车，带着三位旅人驶向他们不敢面对的答案。",
                    List.of(ch("顾言", "列车长"), ch("安然", "旅人"), ch("老何", "旅人"))),
            entry(6, "雾港灯塔", "雾港灯塔", "电视动画", 2023, 8.9, List.of("悬疑", "推理", "群像"),
                    "已完结", "常年被雾笼罩的港口小镇，灯塔管理员开始收到来自未来的求助信。",
                    List.of(ch("周明远", "灯塔管理员"), ch("许雾", "小镇警员"))),
            entry(7, "春樱信号", "春樱信号", "电视动画", 2024, 8.1, List.of("校园", "恋爱", "青春"),
                    "已完结", "天台上的老旧广播站重新开始播音，每天下午五点准时响起一首歌。",
                    List.of(ch("沈星", "广播站站长"), ch("林小满", "匿名投稿人"))),
            entry(8, "深空观测站", "深空观测站", "原创动画", 2026, 9.4, List.of("科幻", "太空", "成长"),
                    "周二 22:30 更新", "人类第一座深空观测站投入使用，站员们在漫长信号延迟里守护彼此。",
                    List.of(ch("程野", "观测站站长"), ch("莫妮", "深空通信员"), ch("阿康", "轨道维修员"))),
            entry(9, "白夜食堂", "白夜食堂", "电视动画", 2024, 8.7, List.of("美食", "日常", "治愈"),
                    "已完结", "只在白夜营业的街角食堂，用一道菜换一个故事。",
                    List.of(ch("纪老板", "食堂老板"), ch("小满", "常客学徒"))),
            entry(10, "赤色回响", "赤色回响", "原创动画", 2025, 8.5, List.of("动作", "冒险", "热血"),
                    "周六 20:30 更新", "旧城区的回响者小队，用共鸣术击退入侵城市记忆的裂界生物。",
                    List.of(ch("炎离", "回响者队长"), ch("白露", "共鸣术士"))),
            entry(11, "记忆邮局", "记忆邮局", "网络动画", 2023, 8.3, List.of("奇幻", "温情", "单元剧"),
                    "已完结", "可以寄送记忆包裹的邮局，帮人们把来不及说的话送到过去。",
                    List.of(ch("邮差小纪", "记忆邮递员"), ch("局长", "邮局管理者"))),
            entry(12, "午夜图书馆", "午夜图书馆", "电视动画", 2026, 8.8, List.of("奇幻", "悬疑", "日常"),
                    "周四 21:00 更新", "午夜十二点后，图书馆的书架会通向书里写着的世界。",
                    List.of(ch("江晚", "夜班图书管理员"), ch("书灵", "图书馆守护灵"))),
            entry(13, "星屑列车", "星屑列车", "剧场版", 2025, 8.2, List.of("科幻", "爱情", "公路"),
                    "剧场版", "一列在星屑中穿行的列车，乘客们各自带着一段未说完的故事。",
                    List.of(ch("苏念", "列车乘务员"), ch("黎川", "持票乘客"))),
            entry(14, "夏日冰镇", "夏日冰镇", "网络动画", 2022, 7.9, List.of("日常", "搞笑", "青春"),
                    "已完结", "海边小镇的便利店，三个打工少年用一个夏天学会长大。",
                    List.of(ch("大鹏", "便利店店员"), ch("小刀", "便利店店员"))),
            entry(15, "山海之间", "山海之间", "原创动画", 2026, 9.1, List.of("奇幻", "冒险", "史诗"),
                    "周一 21:00 更新", "少年背着残缺的舆图出发，沿着山海经里的地名一路修复世界的边界。",
                    List.of(ch("青野", "舆图少年"), ch("白泽", "神兽伙伴"))));

    /** 正式运行时的内存回退卡片。 */
    public static final List<AnimeCard> OFFICIAL_CARDS = List.copyOf(
            OFFICIAL_ENTRIES.stream().map(AnimeMemoryStore::toCard).toList());

    /** 单元测试恢复用种子卡片，避免测试夹具污染正式运行目录。 */
    public static final List<AnimeCard> SEED_CARDS = List.copyOf(
            TEST_ENTRIES.stream().map(AnimeMemoryStore::toCard).toList());

    /**
     * 目录数据面（可变）：管理端新建/编辑写入，公开可见性由 AnimeManageService 管理状态控制。
     */
    public static final List<AnimeCard> CATALOG = new CopyOnWriteArrayList<>(OFFICIAL_CARDS);

    public static final Map<String, String> SEED_SUMMARY = Map.copyOf(
            TEST_ENTRIES.stream().collect(Collectors.toMap(Entry::title, Entry::summary)));

    private static final Map<String, String> OFFICIAL_SUMMARY = Map.copyOf(
            OFFICIAL_ENTRIES.stream().collect(Collectors.toMap(Entry::title, Entry::summary)));

    public static final Map<String, String> SUMMARY = new ConcurrentHashMap<>(OFFICIAL_SUMMARY);

    /** 恢复单元测试专用目录和简介，隔离管理 CRUD 测试之间的静态数据。 */
    public static void resetForTest() {
        CATALOG.clear();
        CATALOG.addAll(SEED_CARDS);
        SUMMARY.clear();
        SUMMARY.putAll(SEED_SUMMARY);
    }

    /** 聚合内存作品详情、角色、相似作品和未来排期。 */
    public static AnimeDetail detailOf(long id) {
        AnimeCard card = CATALOG.stream().filter(c -> c.id() == id).findFirst().orElse(null);
        if (card == null) {
            return null;
        }
        List<AnimeCard> similar = CATALOG.stream()
                .filter(c -> c.id() != id)
                .sorted(Comparator.comparingLong((AnimeCard c) -> sharedTags(c, card)).reversed()
                        .thenComparing(Comparator.comparingDouble(AnimeCard::score).reversed()))
                .limit(3)
                .toList();
        return new AnimeDetail(card.id(), card.title(), card.originalTitle(), card.type(), card.year(),
                card.score(), "已发布", card.coverUrl(), card.tags(), card.updateText(),
                card.summaryOf(), false, charactersOf(id), similar, buildSchedule(card),
                "已导入公开来源");
    }

    /** 统计两个作品的共同标签数量。 */
    private static long sharedTags(AnimeCard card, AnimeCard other) {
        return card.tags().stream().filter(other.tags()::contains).count();
    }

    /** 按作品编号读取种子角色列表。 */
    private static List<AnimeCharacter> charactersOf(long id) {
        return java.util.stream.Stream.concat(OFFICIAL_ENTRIES.stream(), TEST_ENTRIES.stream())
                .filter(e -> e.id() == id)
                .findFirst()
                .map(Entry::characters)
                .orElse(List.of());
    }

    /** 为连载作品构造三集联调排期。 */
    private static List<AnimeSchedule> buildSchedule(AnimeCard card) {
        if (card.updateText() == null || !card.updateText().contains("更新")) {
            return List.of();
        }
        List<AnimeSchedule> schedule = new ArrayList<>();
        LocalDate base = LocalDate.now().plusDays(1);
        for (int i = 0; i < 3; i++) {
            schedule.add(new AnimeSchedule(i + 1, base.plusDays(i * 7L).toString(), i == 0 ? "AIRING" : "PLANNED"));
        }
        return schedule;
    }

    /**
     * 管理端新建作品：加入目录数据面并登记简介（summaryOf 依赖）。
     */
    public static synchronized AnimeCard addCard(AnimeCard card, String summary) {
        CATALOG.add(card);
        if (summary != null && !summary.isBlank()) {
            SUMMARY.put(card.title(), summary);
        }
        return card;
    }

    /**
     * 管理端编辑作品：按 id 替换数据面记录（record 不可变，使用替换语义）。
     */
    public static synchronized boolean updateCard(AnimeCard updated, String summary) {
        for (int i = 0; i < CATALOG.size(); i++) {
            if (CATALOG.get(i).id() == updated.id()) {
                CATALOG.set(i, updated);
                if (summary != null && !summary.isBlank()) {
                    SUMMARY.put(updated.title(), summary);
                }
                return true;
            }
        }
        return false;
    }

    /** 将内部种子项转换为作品卡片。 */
    private static AnimeCard toCard(Entry entry) {
        String coverUrl = entry.coverUrl() == null || entry.coverUrl().isBlank()
                ? "/covers/anime-" + entry.id() + ".svg"
                : entry.coverUrl();
        return new AnimeCard(entry.id(), entry.title(), entry.originalTitle(), entry.type(), entry.year(),
                entry.score(), "已发布", coverUrl, entry.tags(), entry.updateText());
    }

    /** 构造内部种子项，集中维护作品元数据。 */
    private static Entry entry(long id, String title, String originalTitle, String type, int year, double score,
                               List<String> tags, String updateText, String summary, List<AnimeCharacter> characters) {
        return new Entry(id, title, originalTitle, type, year, score, tags, updateText, summary, characters, null);
    }

    /** 构造正式作品种子，并绑定该篇章独有的封面地址。 */
    private static Entry officialEntry(long id, String title, String originalTitle, String type, int year,
                                       double score, List<String> tags, String updateText, String summary,
                                       List<AnimeCharacter> characters, String coverUrl) {
        return new Entry(id, title, originalTitle, type, year, score, tags, updateText, summary, characters, coverUrl);
    }

    /** 构造角色种子对象。 */
    private static AnimeCharacter ch(String name, String role) {
        return new AnimeCharacter(name, role);
    }
}
