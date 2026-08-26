package com.sanye.anime.sanye_anime.model;

import java.time.Instant;

/**
 * 法律正文管理端视图（T-D-07）：包含发布状态与更新人，仅管理端受控接口返回。
 */
public record LegalDocumentView(String key, String title, String content, String status,
                                String updatedBy, Instant updatedAt) {
}
