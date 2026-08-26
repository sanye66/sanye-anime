package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_anime.store.InMemoryAnimeCatalogStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 输入安全测试（T-G-02 第一批）：注入字符串按字面量处理、超长参数拒绝。
 */
class AnimeCatalogServiceSecurityTest {

    private final AnimeCatalogService service = new AnimeCatalogService(new InMemoryAnimeCatalogStore());

    @BeforeEach
    void resetCatalog() {
        AnimeMemoryStore.resetForTest();
    }

    @Test
    void sqlInjectionKeywordIsTreatedAsLiteral() {
        var result = service.list("' OR 1=1 --", null, null, null, null, 1, 20);
        assertEquals(0, result.total(), "注入字符串不应扩大结果集");

        var second = service.list("'; DROP TABLE sanye_anime; --", null, null, null, null, 1, 20);
        assertEquals(0, second.total());
    }

    @Test
    void oversizedKeywordRejected() {
        String longKeyword = "a".repeat(101);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.list(longKeyword, null, null, null, null, 1, 20));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void oversizedTypeAndStatusRejected() {
        assertThrows(BusinessException.class, () -> service.list(null, "x".repeat(21), null, null, null, 1, 20));
        assertThrows(BusinessException.class, () -> service.list(null, null, "x".repeat(21), null, null, 1, 20));
    }
}
