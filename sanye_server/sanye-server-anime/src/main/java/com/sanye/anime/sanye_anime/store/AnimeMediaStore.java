package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;

import java.util.List;

/**
 * 剧集媒体元数据存储抽象：公开侧只读，导入侧按作品整体替换，保证重复导入幂等。
 */
public interface AnimeMediaStore {

    /** 查询一部作品已保存的剧集，按剧集编号升序返回。 */
    List<AnimeEpisode> episodesOf(long animeId);

    /** 替换一部作品的剧集元数据，导入失败时由服务层保证不调用此方法。 */
    void replaceEpisodes(long animeId, List<AnimeEpisode> episodes);
}
