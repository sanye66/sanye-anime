package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.AdminAnimeView;
import com.sanye.anime.sanye_anime.model.AdminAnimeDetailView;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnimeManageServiceTest {

    private final AnimeManageService service = new AnimeManageService(new InMemoryAnimeCatalogStore());
    private static final int SEED_COUNT = AnimeMemoryStore.SEED_CARDS.size();

    @BeforeEach
    void resetCatalog() {
        AnimeMemoryStore.resetForTest();
    }

    @Test
    void listAllReturnsPublishedByDefault() {
        var rows = service.listAll();
        assertEquals(15, rows.size());
        assertTrue(rows.stream().allMatch(row -> row.status().equals("已发布") && row.source().equals("已核验")));
    }

    @Test
    void updateStatusAffectsVisibility() {
        AdminAnimeView view = service.updateStatus(1, "已下架");
        assertEquals("已下架", view.status());
        assertEquals("待补充", view.source());
        assertFalse(service.isPublished(1));
        assertTrue(service.isPublished(2));

        service.updateStatus(1, "已发布");
        assertTrue(service.isPublished(1));
    }

    @Test
    void invalidStatusRejected() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateStatus(1, "乱写"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void unknownAnimeRejected() {
        assertThrows(BusinessException.class, () -> service.updateStatus(999, "已发布"));
    }

    @Test
    void createAddsDraftInvisibleToPublic() {
        AdminAnimeDetailView created = service.create(
                "测试新番", "Test Original", "电视动画", 2026, "一部测试新番。", "测试,科幻", "周三 20:00 更新");
        assertEquals("测试新番", created.title());
        assertEquals("草稿", created.status());
        assertEquals(List.of("测试", "科幻"), created.tags());
        assertEquals(SEED_COUNT + 1, service.listAll().size());
        assertFalse(service.isPublished(created.id()), "草稿不应公开可见");

        service.updateStatus(created.id(), "已发布");
        assertTrue(service.isPublished(created.id()));
        AnimeMemoryStore.AnimeDetail detail = AnimeMemoryStore.detailOf(created.id());
        assertEquals("测试新番", detail.title());
        assertEquals("一部测试新番。", detail.summary());
    }

    @Test
    void createRejectsMissingTitleOrType() {
        assertThrows(BusinessException.class,
                () -> service.create(null, null, "电视动画", 2026, "", "", ""));
        assertThrows(BusinessException.class,
                () -> service.create("标题", null, " ", 2026, "", "", ""));
    }

    @Test
    void updateModifiesFieldsAndKeepsVisibility() {
        AdminAnimeDetailView created = service.create(
                "编辑测试", "", "电视动画", 2026, "原始简介。", "日常", "");
        service.updateStatus(created.id(), "已发布");
        AdminAnimeDetailView updated = service.update(
                created.id(), "编辑后标题", "Edited", null, 2025, "更新后的简介。", "日常,治愈", "周五 21:00 更新");
        assertEquals("编辑后标题", updated.title());
        assertEquals(2025, updated.year());
        assertEquals(List.of("日常", "治愈"), updated.tags());
        assertEquals("周五 21:00 更新", updated.updateText());
        assertTrue(service.isPublished(created.id()), "编辑不改变发布状态");
        assertEquals("编辑后标题", AnimeMemoryStore.detailOf(created.id()).title());
    }

    @Test
    void updateUnknownAnimeRejected() {
        assertThrows(BusinessException.class,
                () -> service.update(999, "标题", "", "电视动画", 2026, "", "", ""));
    }

    @Test
    void createStoresAuthorizedSourceAndUploadedCover() {
        AdminAnimeDetailView created = service.create(
                "来源导入作品", "Imported", "剧场版", 2016, "简介", "爱情,奇幻", "已完结",
                "https://www.yinghco.com.cn/anime/imported", "/admin-profile/profile/upload/imported.jpg");

        assertEquals("https://www.yinghco.com.cn/anime/imported", created.sourceUrl());
        assertEquals("/admin-profile/profile/upload/imported.jpg", created.coverUrl());
        assertEquals("/admin-profile/profile/upload/imported.jpg",
                AnimeMemoryStore.detailOf(created.id()).coverUrl());
    }

    @Test
    void rejectsUnsafeSourceAndCoverUrls() {
        assertThrows(BusinessException.class, () -> service.create(
                "非法来源", "", "电视动画", 2026, "", "", "",
                "http://example.com/page", null));
        assertThrows(BusinessException.class, () -> service.create(
                "非法封面", "", "电视动画", 2026, "", "", "",
                "https://example.com/page", "javascript:alert(1)"));
    }
}
