package com.sanye.anime.sanye_ai_chat.ai;

import com.sanye.anime.sanye_ai_chat.client.AnimeBrief;
import com.sanye.anime.sanye_ai_chat.client.AnimeClient;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_core.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.ArrayList;
import java.util.Objects;

/**
 * 推荐卡片链路：识别“推荐/相似”意图后，从静态作品池挑选候选，再通过 AnimeClient
 * 回源动漫服务校验作品存在且已发布（T-C-05 跨服务链路）；动漫服务不可用时回退静态池。
 * T-E-03 RAG 检索与 T-E-07 结构化推荐卡片接入后替换静态池。
 */
@Component
public class RecommendationExtractor {

    private static final Logger log = LoggerFactory.getLogger(RecommendationExtractor.class);

    private static final List<RecommendationView> STATIC_POOL = List.of(
            new RecommendationView(133, "无职转生 · 第一季", "从重新开始的人生出发，适合喜欢异世界冒险与角色成长的观众。"),
            new RecommendationView(136, "无职转生 · 第二季", "延续鲁迪乌斯的异世界旅程，适合关注伙伴关系和魔法冒险的观众。"),
            new RecommendationView(135, "无职转生 · 第二季 Part.2", "第二季后半篇章继续推进人物选择与命运交汇。"),
            new RecommendationView(128, "无职转生 · 第三季", "新的篇章带来更大的舞台，适合想继续追看主线成长的观众。"),
            new RecommendationView(137, "无职转生 · OAD 特别篇", "补充主线旅程中的特别篇故事，适合完成系列观看。")
    );

    private final AnimeClient animeClient;

    /** 注入作品远程客户端，推荐候选必须经过真实目录和发布状态校验。 */
    public RecommendationExtractor(AnimeClient animeClient) {
        this.animeClient = animeClient;
    }

    /** 判断用户问题是否表达推荐或相似作品意图。 */
    public boolean wantsRecommendation(String userText) {
        return userText != null && (userText.contains("推荐") || userText.contains("相似") || userText.contains("有什么好看"));
    }

    /** 从候选池筛选推荐并回源校验，当前作品不重复推荐。 */
    public List<RecommendationView> extract(String userText, Long contextAnimeId) {
        if (!wantsRecommendation(userText)) {
            return List.of();
        }
        return STATIC_POOL.stream()
                .filter(r -> contextAnimeId == null || r.animeId() != contextAnimeId)
                .limit(2)
                .map(this::resolveRemote)
                .toList();
    }

    /** 严格确认候选存在且已发布，模型返回的未校验作品不会暴露给前端。 */
    public List<RecommendationView> verifyStrict(List<RecommendationView> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        List<RecommendationView> verified = new ArrayList<>();
        for (RecommendationView candidate : candidates) {
            if (candidate == null || verified.size() >= 3) {
                continue;
            }
            try {
                ApiResponse<AnimeBrief> response = animeClient.getAnime(candidate.animeId());
                if (response != null && response.code() == 0 && response.data() != null
                        && "已发布".equals(response.data().status())) {
                    verified.add(new RecommendationView(candidate.animeId(), response.data().title(),
                            candidate.reason()));
                }
            } catch (RuntimeException ex) {
                log.warn("推荐严格回源失败 animeId={} error={}", candidate.animeId(), ex.getMessage());
            }
        }
        return verified;
    }

    /** 尝试用动画服务的标题替换静态候选，失败时保留静态展示数据。 */
    private RecommendationView resolveRemote(RecommendationView candidate) {
        try {
            ApiResponse<AnimeBrief> response = animeClient.getAnime(candidate.animeId());
            if (response != null && response.code() == 0 && response.data() != null
                    && "已发布".equals(response.data().status())) {
                log.info("推荐回源校验通过 animeId={} title={} remoteRequestId={}",
                        candidate.animeId(), response.data().title(), response.requestId());
                return new RecommendationView(candidate.animeId(), response.data().title(), candidate.reason());
            }
            log.warn("推荐回源校验未通过 animeId={} code={}", candidate.animeId(), response == null ? -1 : response.code());
        } catch (RuntimeException ex) {
            log.warn("推荐回源调用失败，回退静态池 animeId={} error={}", candidate.animeId(), ex.getMessage());
        }
        return candidate;
    }
}
