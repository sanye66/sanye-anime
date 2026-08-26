package com.sanye.anime.sanye_ai_chat.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 推荐卡片结构化输出解析（T-E-07）：从模型回答中提取 JSON 数组
 * [{"animeId":3,"title":"纸月计划","reason":"..."}]；解析失败返回空列表，
 * 由上游回退到静态候选或跳过推荐事件。
 */
@Component
public class RecommendationParser {

    private static final Logger log = LoggerFactory.getLogger(RecommendationParser.class);
    private static final Pattern JSON_ARRAY = Pattern.compile("\\[\\s*\\{.*?}\\s*]", Pattern.DOTALL);
    private static final TypeReference<List<RecommendationView>> TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    /** 注入统一 JSON 转换器，解析失败时由上层继续使用安全降级路径。 */
    public RecommendationParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 从回答中提取 JSON 推荐数组，格式错误时返回空列表触发上游降级。 */
    public List<RecommendationView> parse(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        Matcher matcher = JSON_ARRAY.matcher(text);
        if (!matcher.find()) {
            return List.of();
        }
        try {
            List<RecommendationView> parsed = objectMapper.readValue(matcher.group(), TYPE);
            return parsed == null ? List.of() : parsed;
        } catch (JsonProcessingException ex) {
            log.warn("推荐结构化输出解析失败 error={}", ex.getMessage());
            return List.of();
        }
    }
}
