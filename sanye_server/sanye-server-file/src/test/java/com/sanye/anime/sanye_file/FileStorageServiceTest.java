package com.sanye.anime.sanye_file;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_file.model.FileMetaView;
import com.sanye.anime.sanye_file.model.UploadView;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileStorageServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    private FileStorageService service(Path root) {
        return new FileStorageService(jdbc, "sanye_file", root.toString());
    }

    private MockMultipartFile svg() {
        return new MockMultipartFile("file", "cover.svg", "image/svg+xml",
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void uploadRejectsOversize(@TempDir Path tmp) {
        MockMultipartFile file = new MockMultipartFile("file", "big.svg", "image/svg+xml",
                new byte[(int) FileStorageService.MAX_SIZE_BYTES + 1]);
        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).upload(file, "anime"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void uploadRejectsDisallowedExtension(@TempDir Path tmp) {
        MockMultipartFile file = new MockMultipartFile("file", "evil.exe", "image/svg+xml", new byte[8]);
        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).upload(file, "anime"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void uploadRejectsDisallowedContentType(@TempDir Path tmp) {
        MockMultipartFile file = new MockMultipartFile("file", "cover.png", "application/octet-stream", new byte[8]);
        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).upload(file, "anime"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void uploadRejectsUnsafeBucket(@TempDir Path tmp) {
        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).upload(svg(), "../outside"));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
        assertFalse(Files.exists(tmp.getParent().resolve("outside")), "非法目录不能写到存储根目录之外");
    }

    @Test
    void uploadPersistsBytesAndMeta(@TempDir Path tmp) {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1L);

        UploadView view = service(tmp).upload(svg(), "anime", 42L);

        assertEquals(1L, view.id());
        assertEquals("/api/v1/files/1", view.url());
        try (Stream<Path> files = Files.list(tmp.resolve("anime"))) {
            assertTrue(files.findAny().isPresent(), "文件应写入存储目录");
        } catch (Exception ex) {
            throw new AssertionError(ex);
        }
        verify(jdbc).queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void downloadReadsFile(@TempDir Path tmp) throws Exception {
        Path target = tmp.resolve("anime").resolve("abc.svg");
        Files.createDirectories(target.getParent());
        byte[] content = "hello".getBytes(StandardCharsets.UTF_8);
        Files.write(target, content);
        FileMetaView meta = new FileMetaView(1, "anime", "abc.svg", "a.svg", "image/svg+xml",
                content.length, "sha", "PASS", "t");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(1L))).thenReturn(List.of(meta));

        FileStorageService.StoredFile stored = service(tmp).read(1L);

        assertEquals("hello", new String(stored.bytes(), StandardCharsets.UTF_8));
        assertEquals("image/svg+xml", stored.contentType());
    }

    @Test
    void downloadRejectsPathTraversal(@TempDir Path tmp) {
        FileMetaView meta = new FileMetaView(1, "anime", "../evil.txt", "a.txt", "text/plain", 4, "sha", "PASS", "t");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(1L))).thenReturn(List.of(meta));

        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).read(1L));
        assertEquals(ErrorCode.PARAM_INVALID, ex.errorCode());
    }

    @Test
    void downloadMissingMetaReturnsNotFound(@TempDir Path tmp) {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(999L))).thenReturn(List.of());
        BusinessException ex = assertThrows(BusinessException.class, () -> service(tmp).read(999L));
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode());
    }
}
