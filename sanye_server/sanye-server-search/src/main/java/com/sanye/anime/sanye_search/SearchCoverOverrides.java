package com.sanye.anime.sanye_search;

import java.util.Map;

/** 为已确认长期不可用的来源图片提供同一作品的稳定真实封面。 */
final class SearchCoverOverrides {

    private static final Map<String, String> VERIFIED_OVERRIDES = Map.of(
            "https://img.lzzyimg.com/upload/vod/20220501-1/4ccbe000d359e7428dbe806ba68a052d.jpg",
            "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx14813-3mNvcKNEQcDs.jpg",
            "https://img.lzzyimg.com/upload/vod/20240221-1/53a47ca2b1563c17e90be28b4664ed3c.jpg",
            "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx128643-ohNhGx7QDpdg.jpg"
    );

    private SearchCoverOverrides() {
    }

    static String resolve(String coverUrl) {
        return VERIFIED_OVERRIDES.getOrDefault(coverUrl, coverUrl);
    }
}
