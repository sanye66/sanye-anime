package com.sanye.anime.sanye_file.model;

/**
 * 文件元数据视图。
 */
public record FileMetaView(long id, String bucket, String objectKey, String originalName, String contentType,
                           long sizeBytes, String sha256, String scanStatus, String createdAt) {
}
