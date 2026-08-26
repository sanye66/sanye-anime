package com.sanye.anime.sanye_anime.store;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存法律正文存储（联调基线，线程安全）。服务重启数据丢失，仅用于开发联调；
 * 正式持久化由 PostgreSQL 实现替换。
 */
@Repository
@ConditionalOnProperty(name = "sanye.legal.store", havingValue = "memory")
public class InMemoryLegalDocumentStore implements LegalDocumentStore {

    private final Map<String, LegalDocument> documents = new ConcurrentHashMap<>();

    /** 按状态过滤内存文档并按 key 排序，保证管理列表稳定。 */
    @Override
    public List<LegalDocument> list(String status) {
        return documents.values().stream()
                .filter(doc -> status == null || status.equals(doc.status()))
                .sorted(Comparator.comparing(LegalDocument::key))
                .toList();
    }

    /** 从内存映射中查找指定法律文档。 */
    @Override
    public Optional<LegalDocument> get(String key) {
        return Optional.ofNullable(documents.get(key));
    }

    /** 以不可变文档对象替换当前 key 的内容。 */
    @Override
    public LegalDocument save(String key, String title, String content, String status, String updatedBy, Instant now) {
        LegalDocument document = new LegalDocument(key, title, content, status, updatedBy, now);
        documents.put(key, document);
        return document;
    }
}
