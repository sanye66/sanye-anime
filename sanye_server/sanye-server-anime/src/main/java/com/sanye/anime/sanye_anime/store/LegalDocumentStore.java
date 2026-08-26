package com.sanye.anime.sanye_anime.store;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * 法律正文存储抽象（T-D-07）：按 doc_key 读写，公开侧只读已发布版本。
 * 联调阶段使用内存实现；正式持久化使用 PostgreSQL 实现。
 */
public interface LegalDocumentStore {

    /** 按状态查询法律文档；状态为空表示查询全部。 */
    List<LegalDocument> list(String status);

    /** 按固定文档 key 查询单篇正文。 */
    Optional<LegalDocument> get(String key);

    /** 保存或更新正文，并记录操作者和更新时间。 */
    LegalDocument save(String key, String title, String content, String status, String updatedBy, Instant now);

    record LegalDocument(String key, String title, String content, String status,
                         String updatedBy, Instant updatedAt) {
    }
}
