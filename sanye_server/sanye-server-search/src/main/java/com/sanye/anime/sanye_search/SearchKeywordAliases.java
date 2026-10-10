package com.sanye.anime.sanye_search;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 为明确的作品简称补充正式标题，同时保留用户原词的正常召回。 */
final class SearchKeywordAliases {

    private static final Map<String, String> ALIASES = Map.of(
            "春物", "我的青春恋爱物语果然有问题",
            "俺ガイル", "我的青春恋爱物语果然有问题",
            "oregairu", "我的青春恋爱物语果然有问题"
    );

    private SearchKeywordAliases() {
    }

    static String resolve(String keyword) {
        String trimmed = keyword == null ? "" : keyword.trim();
        return ALIASES.getOrDefault(aliasKey(trimmed), trimmed);
    }

    /** 正式标题优先，原词随后；普通关键词只返回自身。 */
    static List<String> expand(String keyword) {
        String trimmed = keyword == null ? "" : keyword.trim();
        if (trimmed.isBlank()) {
            return List.of();
        }
        String canonical = resolve(trimmed);
        if (aliasKey(canonical).equals(aliasKey(trimmed))) {
            return List.of(trimmed);
        }
        return List.of(canonical, trimmed);
    }

    private static String aliasKey(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{P}\\p{S}\\s]+", "");
    }
}
