package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.LegalDocumentView;
import com.sanye.anime.sanye_anime.model.PublicLegalDocument;
import com.sanye.anime.sanye_anime.store.LegalDocumentStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * 法律正文服务（T-D-07）：公开侧只读已发布版本（官网），管理侧支持保存草稿/发布。
 * 文档 key 固定为四类法律信息；正式文案审查（GAP-013）前种子内容保持占位。
 */
@Service
public class LegalDocumentService {

    /** 官网允许维护的固定正文标识。 */
    public static final Set<String> DOC_KEYS = Set.of("privacy", "terms", "copyright", "contact");
    /** 法律正文仅允许草稿和已发布两种状态。 */
    public static final Set<String> VALID_STATUSES = Set.of("草稿", "已发布");

    private static final int MAX_TITLE_LENGTH = 100;
    private static final int MAX_CONTENT_LENGTH = 20_000;

    private final LegalDocumentStore legalDocumentStore;

    /** 注入法律正文存储，公开和管理读取共享同一校验规则。 */
    public LegalDocumentService(LegalDocumentStore legalDocumentStore) {
        this.legalDocumentStore = legalDocumentStore;
    }

    /**
     * 官网公开接口：仅返回已发布文档，剥离内部状态与更新人。
     */
    public List<PublicLegalDocument> listPublished() {
        return legalDocumentStore.list("已发布").stream()
                .map(doc -> new PublicLegalDocument(doc.key(), doc.title(), doc.content(), doc.updatedAt()))
                .toList();
    }

    /**
     * 管理端受控接口：返回全部文档（含草稿）。
     */
    public List<LegalDocumentView> listAll() {
        return legalDocumentStore.list(null).stream()
                .map(this::toView)
                .toList();
    }

    /**
     * 保存正文：key 白名单校验、标题与正文长度校验、状态白名单校验。
     * 保存“已发布”即时对官网公开接口生效；“草稿”对外不可见。
     */
    public LegalDocumentView update(String key, String title, String content, String status, String updatedBy) {
        if (key == null || !DOC_KEYS.contains(key)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "不支持的文档 key：" + key);
        }
        String safeTitle = title == null ? "" : title.trim();
        if (safeTitle.isEmpty() || safeTitle.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "标题不能为空且不能超过 " + MAX_TITLE_LENGTH + " 字");
        }
        String safeContent = content == null ? "" : content.trim();
        if (safeContent.isEmpty() || safeContent.length() > MAX_CONTENT_LENGTH) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "正文不能为空且不能超过 " + MAX_CONTENT_LENGTH + " 字");
        }
        String safeStatus = status == null || status.isBlank() ? "草稿" : status.trim();
        if (!VALID_STATUSES.contains(safeStatus)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "status 仅支持草稿或已发布");
        }
        LegalDocumentStore.LegalDocument saved = legalDocumentStore.save(
                key, safeTitle, safeContent, safeStatus, updatedBy, Instant.now());
        return toView(saved);
    }

    /** 将存储模型转换为管理接口模型，保留状态和更新人信息。 */
    private LegalDocumentView toView(LegalDocumentStore.LegalDocument doc) {
        return new LegalDocumentView(doc.key(), doc.title(), doc.content(), doc.status(),
                doc.updatedBy(), doc.updatedAt());
    }
}
