package com.sanye.anime.sanye_anime.model;

/** 管理端 URL 一键导入结果：作品详情和本次导入的媒体资源数量。 */
public record AdminAnimeImportResult(AdminAnimeDetailView anime, int episodesImported) {
}
