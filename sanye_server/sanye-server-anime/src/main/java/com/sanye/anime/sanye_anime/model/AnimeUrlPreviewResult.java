package com.sanye.anime.sanye_anime.model;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;

import java.util.List;

/** 外部作品站内直接观看预览；只返回公开元数据和播放器地址，不写入目录。 */
public record AnimeUrlPreviewResult(String title, String originalTitle, String type, Integer year,
                                    String summary, List<String> tags, String updateText,
                                    String coverUrl, String sourceUrl, List<AnimeEpisode> episodes) {
}
