package com.sanye.anime.sanye_anime.model;

import java.time.Instant;

/**
 * 法律正文公开视图（T-D-07）：官网只读已发布版本，不暴露内部状态与更新人。
 */
public record PublicLegalDocument(String key, String title, String content, Instant updatedAt) {
}
