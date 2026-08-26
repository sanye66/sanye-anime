package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 内存媒体元数据存储，供无数据库开发和单元测试使用。 */
@Repository
@ConditionalOnProperty(name = "sanye.media.store", havingValue = "memory")
public class InMemoryAnimeMediaStore implements AnimeMediaStore {

    private final Map<Long, List<AnimeEpisode>> episodesByAnime = new ConcurrentHashMap<>();

    /** 返回不可变快照，避免调用方修改存储内部列表。 */
    @Override
    public List<AnimeEpisode> episodesOf(long animeId) {
        return List.copyOf(episodesByAnime.getOrDefault(animeId, List.of()));
    }

    /** 以复制列表方式替换，避免外部线程并发修改导入结果。 */
    @Override
    public void replaceEpisodes(long animeId, List<AnimeEpisode> episodes) {
        episodesByAnime.put(animeId, List.copyOf(new ArrayList<>(episodes)));
    }
}
