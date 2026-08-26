package com.sanye.anime.sanye_file;

import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class FileControllerTest {

    private final FileStorageService fileStorageService = mock(FileStorageService.class);
    private final FileController controller = new FileController(fileStorageService, mock());

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void uploadRequiresAuthenticatedUser() {
        AuthContext.set(new AuthContext.Context(null, "device-test", true));
        MockMultipartFile file = new MockMultipartFile("file", "cover.svg", "image/svg+xml",
                "<svg/>".getBytes(StandardCharsets.UTF_8));

        BusinessException ex = assertThrows(BusinessException.class, () -> controller.upload(file, "anime"));

        assertEquals(ErrorCode.UNAUTHORIZED, ex.errorCode());
        verify(fileStorageService, never()).upload(file, "anime", 42L);
    }

    @Test
    void downloadRequiresAuthenticatedOwner() {
        AuthContext.set(new AuthContext.Context(null, "device-test", true));

        BusinessException ex = assertThrows(BusinessException.class, () -> controller.download(1L));

        assertEquals(ErrorCode.UNAUTHORIZED, ex.errorCode());
        verify(fileStorageService, never()).readForOwner(1L, 42L);
    }
}
