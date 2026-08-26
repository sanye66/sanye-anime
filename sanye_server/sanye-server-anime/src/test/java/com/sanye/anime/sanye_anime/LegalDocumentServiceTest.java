package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.LegalDocumentView;
import com.sanye.anime.sanye_anime.model.PublicLegalDocument;
import com.sanye.anime.sanye_anime.store.InMemoryLegalDocumentStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegalDocumentServiceTest {

    private final LegalDocumentService service = new LegalDocumentService(new InMemoryLegalDocumentStore());

    @BeforeEach
    void seed() {
        service.update("privacy", "隐私政策摘要", "默认隐私文案。", "已发布", "seed");
        service.update("terms", "使用条款摘要", "默认条款文案。", "已发布", "seed");
        service.update("copyright", "版权与内容来源", "默认版权文案。", "已发布", "seed");
        service.update("contact", "联系我们", "默认联系文案。", "已发布", "seed");
    }

    @Test
    void listPublishedReturnsOnlyPublishedDocuments() {
        List<PublicLegalDocument> published = service.listPublished();
        assertEquals(4, published.size());
        assertTrue(published.stream().allMatch(doc -> !doc.title().isBlank()));

        service.update("privacy", "草稿标题", "草稿内容。", "草稿", "admin");
        assertEquals(3, service.listPublished().size(), "草稿不应出现在公开接口");
    }

    @Test
    void listAllIncludesDrafts() {
        service.update("privacy", "草稿标题", "草稿内容。", "草稿", "admin");
        List<LegalDocumentView> all = service.listAll();
        assertEquals(4, all.size());
        LegalDocumentView privacy = all.stream()
                .filter(doc -> doc.key().equals("privacy"))
                .findFirst()
                .orElseThrow();
        assertEquals("草稿", privacy.status());
        assertEquals("admin", privacy.updatedBy());
    }

    @Test
    void updateRejectsUnknownKey() {
        assertThrows(BusinessException.class,
                () -> service.update("unknown", "标题", "内容", "已发布", "admin"));
    }

    @Test
    void updateRejectsBlankOrOverlongTitle() {
        assertThrows(BusinessException.class,
                () -> service.update("privacy", "  ", "内容", "已发布", "admin"));
        assertThrows(BusinessException.class,
                () -> service.update("privacy", "x".repeat(101), "内容", "已发布", "admin"));
    }

    @Test
    void updateRejectsBlankOrOverlongContent() {
        assertThrows(BusinessException.class,
                () -> service.update("privacy", "标题", "  ", "已发布", "admin"));
        assertThrows(BusinessException.class,
                () -> service.update("privacy", "标题", "x".repeat(20_001), "已发布", "admin"));
    }

    @Test
    void updateRejectsInvalidStatus() {
        assertThrows(BusinessException.class,
                () -> service.update("privacy", "标题", "内容", "已下线", "admin"));
    }

    @Test
    void publishMakesNewContentVisibleToPublic() {
        service.update("privacy", "新版隐私政策", "这是审查后的正式文案。\n\n第二段补充说明。", "已发布", "admin");
        List<PublicLegalDocument> published = service.listPublished();
        PublicLegalDocument privacy = published.stream()
                .filter(doc -> doc.key().equals("privacy"))
                .findFirst()
                .orElseThrow();
        assertEquals("新版隐私政策", privacy.title());
        assertTrue(privacy.content().contains("正式文案"));
    }

    @Test
    void draftUpdateHidesDocumentFromPublicUntilPublished() {
        service.update("privacy", "待审查草稿", "草稿内容。", "草稿", "editor");
        assertEquals(3, service.listPublished().size(), "保存草稿后公开接口应隐藏该文档");
        assertTrue(service.listPublished().stream().noneMatch(doc -> doc.key().equals("privacy")));

        service.update("privacy", "审查通过文案", "草稿内容。", "已发布", "editor");
        assertEquals(4, service.listPublished().size(), "发布后重新对外可见");
    }
}
