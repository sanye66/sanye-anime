package com.sanye.anime.sanye_file;

import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import com.sanye.anime.sanye_file.model.FileMetaView;
import com.sanye.anime.sanye_file.model.UploadView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 文件接口（T-G-02 第二批）：上传（白名单校验）与私有下载。
 */
@RestController
@RequestMapping("/api/v1/files")
public class FileController {

    private final FileStorageService fileStorageService;
    private final HttpServletRequest request;

    /** 注入文件存储和请求对象，上传与下载统一复用用户上下文。 */
    public FileController(FileStorageService fileStorageService, HttpServletRequest request) {
        this.fileStorageService = fileStorageService;
        this.request = request;
    }

    /** 校验登录身份后接收图片上传，并返回可访问的文件编号。 */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<UploadView> upload(@RequestParam("file") MultipartFile file,
                                          @RequestParam(defaultValue = "anime") String bucket) {
        if (AuthContext.get().userId() == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "登录后才能上传文件");
        }
        return ApiResponse.ok(fileStorageService.upload(file, bucket, AuthContext.requireUserId()), requestId());
    }

    /** 读取当前用户拥有的文件并设置安全的下载响应头。 */
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> download(@PathVariable long id) {
        FileStorageService.StoredFile stored = fileStorageService.readForOwner(id, AuthContext.requireUserId());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, stored.contentType())
                .header(HttpHeaders.CONTENT_DISPOSITION, stored.contentDisposition())
                .body(stored.bytes());
    }

    /** 返回当前用户文件的元数据，避免泄露其他用户对象信息。 */
    @GetMapping("/{id}/meta")
    public ApiResponse<FileMetaView> meta(@PathVariable long id) {
        return ApiResponse.ok(fileStorageService.getMetaForOwner(id, AuthContext.requireUserId()), requestId());
    }

    /** 读取请求编号，保持上传和元数据接口响应可追踪。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
