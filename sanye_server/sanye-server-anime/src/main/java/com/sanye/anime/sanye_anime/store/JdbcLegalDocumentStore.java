package com.sanye.anime.sanye_anime.store;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * PostgreSQL 法律正文存储（T-D-07）：sanye_legal_document 表按 doc_key 主键 upsert，
 * 种子数据由 V2 迁移写入，服务重启后编辑结果可恢复。
 */
@Repository
@ConditionalOnProperty(name = "sanye.legal.store", havingValue = "pg", matchIfMissing = true)
public class JdbcLegalDocumentStore implements LegalDocumentStore {

    private final JdbcTemplate jdbc;
    private final String schema;

    /** 注入数据库访问组件，正文表名通过受控 schema 配置拼接。 */
    public JdbcLegalDocumentStore(JdbcTemplate jdbc,
                                  @Value("${sanye.legal.schema:sanye_anime}") String schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** 返回受控正文表名，文档 key 和正文内容仍通过参数绑定。 */
    private String table() {
        // 表名只由受控配置组成，正文和 key 均通过参数绑定写入。
        return schema + ".sanye_legal_document";
    }

    /** 查询全部或指定状态的法律正文。 */
    @Override
    public List<LegalDocument> list(String status) {
        if (status == null) {
            return jdbc.query("select doc_key, title, content, status, updated_by, updated_at from " + table()
                            + " order by doc_key",
                    (rs, rowNum) -> mapDocument(rs));
        }
        return jdbc.query("select doc_key, title, content, status, updated_by, updated_at from " + table()
                        + " where status = ? order by doc_key",
                (rs, rowNum) -> mapDocument(rs), status);
    }

    /** 按文档 key 查询数据库正文。 */
    @Override
    public Optional<LegalDocument> get(String key) {
        return jdbc.query("select doc_key, title, content, status, updated_by, updated_at from " + table()
                        + " where doc_key = ?",
                (rs, rowNum) -> mapDocument(rs), key)
                .stream().findFirst();
    }

    /** 使用 upsert 保存正文，保证相同 key 只有一份当前版本。 */
    @Override
    public LegalDocument save(String key, String title, String content, String status, String updatedBy, Instant now) {
        int updated = jdbc.update(
                "insert into " + table() + " (doc_key, title, content, status, updated_by, updated_at) "
                        + "values (?, ?, ?, ?, ?, ?) "
                        + "on conflict (doc_key) do update set title = excluded.title, "
                        + "content = excluded.content, status = excluded.status, "
                        + "updated_by = excluded.updated_by, updated_at = excluded.updated_at",
                key, title, content, status, updatedBy, java.sql.Timestamp.from(now));
        if (updated <= 0) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "法律正文保存失败");
        }
        return get(key).orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "法律正文保存失败"));
    }

    /** 将数据库行转换为法律文档领域模型。 */
    private LegalDocument mapDocument(ResultSet rs) throws SQLException {
        Instant updatedAt = rs.getTimestamp("updated_at").toInstant();
        return new LegalDocument(rs.getString("doc_key"), rs.getString("title"), rs.getString("content"),
                rs.getString("status"), rs.getString("updated_by"), updatedAt);
    }
}
