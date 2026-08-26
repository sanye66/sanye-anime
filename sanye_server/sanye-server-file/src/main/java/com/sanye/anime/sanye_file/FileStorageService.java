package com.sanye.anime.sanye_file;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_file.model.FileMetaView;
import com.sanye.anime.sanye_file.model.UploadView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.ContentDisposition;

/**
 * 文件存储服务（T-G-02 第二批）：本地磁盘 + PG 元数据。
 * 安全边界：大小上限、内容类型与扩展名白名单、服务端生成 objectKey（杜绝路径穿越）、
 * 读取路径规范化校验、SHA-256 摘要。生产接入 MinIO 时保留同一契约。
 */
@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    public static final long MAX_SIZE_BYTES = 5 * 1024 * 1024;
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif");
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "png", "jpg", "jpeg", "webp", "svg", "gif");

    private final JdbcTemplate jdbc;
    private final String schema;
    private final Path storageRoot;

    /** 注入元数据数据库和根目录配置，建立受控的文件存储边界。 */
    public FileStorageService(JdbcTemplate jdbc,
                              @Value("${sanye.file.schema:sanye_file}") String schema,
                              @Value("${sanye.file.storage-dir:./sanye_deploy/.local/files}") String storageDir) {
        this.jdbc = jdbc;
        this.schema = schema;
        this.storageRoot = Paths.get(storageDir).toAbsolutePath().normalize();
    }

    /** 兼容直接调用方；HTTP 请求必须使用带所有者编号的重载。 */
    public UploadView upload(MultipartFile file, String bucket) {
        return upload(file, bucket, null);
    }

    /** 校验图片白名单、写入磁盘和元数据，并返回文件访问地址。 */
    public UploadView upload(MultipartFile file, String bucket, Long ownerUserId) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "文件不能为空");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "文件大小不能超过 5MB");
        }
        String originalName = StringUtils.cleanPath(file.getOriginalFilename() == null ? "" : file.getOriginalFilename());
        String extension = extensionOf(originalName);
        if (!allowedExtension(extension)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "仅支持图片文件（png/jpg/jpeg/webp/svg/gif）");
        }
        if (!allowedContentType(file.getContentType())) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "不支持的文件类型");
        }

        String safeBucket = safeBucket(bucket);
        String objectKey = UUID.randomUUID() + "." + extension;
        Path target = resolveTarget(safeBucket, objectKey);
        byte[] bytes;
        try {
            bytes = file.getBytes();
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (IOException ex) {
            log.error("文件写入失败 key={} error={}", objectKey, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件保存失败");
        }

        Long id = jdbc.queryForObject(
                "insert into " + table()
                        + " (bucket, object_key, original_name, content_type, size_bytes, sha256, scan_status, owner_user_id, status) "
                        + "values (?, ?, ?, ?, ?, ?, 'PASS', ?, 'ACTIVE') returning id",
                Long.class, safeBucket, objectKey, originalName, file.getContentType(), bytes.length, sha256(bytes), ownerUserId);
        log.info("文件上传成功 id={} bucket={} key={} size={}", id, safeBucket, objectKey, bytes.length);
        return new UploadView(id, "/api/v1/files/" + id);
    }

    /** 查询活动文件的公开元数据，不进行所有者过滤。 */
    public FileMetaView getMeta(long id) {
        return jdbc.query("select id, bucket, object_key, original_name, content_type, size_bytes, sha256, scan_status, created_at "
                        + "from " + table() + " where id = ? and status = 'ACTIVE'",
                (rs, rowNum) -> new FileMetaView(rs.getLong("id"), rs.getString("bucket"), rs.getString("object_key"),
                        rs.getString("original_name"), rs.getString("content_type"), rs.getLong("size_bytes"),
                        rs.getString("sha256"), rs.getString("scan_status"),
                        rs.getTimestamp("created_at").toInstant().toString()),
                id)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 按文件编号和所有者查询元数据，阻断越权读取。 */
    public FileMetaView getMetaForOwner(long id, long ownerUserId) {
        return jdbc.query("select id, bucket, object_key, original_name, content_type, size_bytes, sha256, scan_status, created_at "
                        + "from " + table() + " where id = ? and owner_user_id = ? and status = 'ACTIVE'",
                (rs, rowNum) -> new FileMetaView(rs.getLong("id"), rs.getString("bucket"), rs.getString("object_key"),
                        rs.getString("original_name"), rs.getString("content_type"), rs.getLong("size_bytes"),
                        rs.getString("sha256"), rs.getString("scan_status"),
                        rs.getTimestamp("created_at").toInstant().toString()),
                id, ownerUserId)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 读取文件元数据并从规范化路径加载内容。 */
    public StoredFile read(long id) {
        FileMetaView meta = getMeta(id);
        Path target = resolveTarget(meta.bucket(), meta.objectKey());
        if (!Files.exists(target)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        try {
            return new StoredFile(Files.readAllBytes(target), meta.contentType(), meta.originalName());
        } catch (IOException ex) {
            log.error("文件读取失败 id={} error={}", id, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件读取失败");
        }
    }

    /** 先完成所有者校验，再读取文件内容。 */
    public StoredFile readForOwner(long id, long ownerUserId) {
        FileMetaView meta = getMetaForOwner(id, ownerUserId);
        return read(meta);
    }

    /** 根据已校验元数据读取磁盘文件，并统一处理 IO 异常。 */
    private StoredFile read(FileMetaView meta) {
        Path target = resolveTarget(meta.bucket(), meta.objectKey());
        if (!Files.exists(target)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        try {
            return new StoredFile(Files.readAllBytes(target), meta.contentType(), meta.originalName());
        } catch (IOException ex) {
            log.error("文件读取失败 id={} error={}", meta.id(), ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件读取失败");
        }
    }

    /** 规范化存储路径并验证目标仍位于对应 bucket 根目录内。 */
    private Path resolveTarget(String bucket, String objectKey) {
        Path bucketRoot = storageRoot.resolve(safeBucket(bucket)).normalize();
        Path target = bucketRoot.resolve(objectKey).normalize();
        if (!bucketRoot.startsWith(storageRoot) || !target.startsWith(bucketRoot)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "非法的文件路径");
        }
        return target;
    }

    /** 将 bucket 限制为安全字符集，防止目录穿越和任意路径写入。 */
    private String safeBucket(String bucket) {
        String value = bucket == null || bucket.isBlank() ? "anime" : bucket.trim();
        if (!value.matches("[a-zA-Z0-9_-]{1,64}")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "非法的文件目录");
        }
        return value;
    }

    /** 从清理后的原始文件名提取小写扩展名。 */
    private String extensionOf(String originalName) {
        if (originalName == null || originalName.isBlank() || !originalName.contains(".")) {
            return "";
        }
        int dot = originalName.lastIndexOf('.');
        return dot < 0 || dot == originalName.length() - 1
                ? "" : originalName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 判断文件扩展名是否在图片白名单中。 */
    private boolean allowedExtension(String extension) {
        return extension != null && ALLOWED_EXTENSIONS.contains(extension);
    }

    /** 判断客户端声明的 MIME 类型是否在图片白名单中。 */
    private boolean allowedContentType(String contentType) {
        return contentType != null && ALLOWED_CONTENT_TYPES.contains(contentType);
    }

    /** 计算文件摘要，供完整性校验和后续对象存储迁移使用。 */
    private String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    /** 返回受配置控制的元数据表名，业务 SQL 仍使用参数绑定。 */
    private String table() {
        return schema + ".sanye_file_object";
    }

    public record StoredFile(byte[] bytes, String contentType, String originalName) {
        /** 生成兼容中文文件名的内联 Content-Disposition。 */
        public String contentDisposition() {
            return ContentDisposition.inline()
                    .filename(originalName == null ? "file" : originalName, StandardCharsets.UTF_8)
                    .build()
                    .toString();
        }
    }
}
