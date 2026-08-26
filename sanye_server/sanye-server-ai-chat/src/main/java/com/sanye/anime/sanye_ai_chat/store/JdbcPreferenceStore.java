package com.sanye.anime.sanye_ai_chat.store;

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
 * PostgreSQL 偏好存储（T-D-05）：sanye_ai_preference 表按 owner_key 主键 upsert，
 * 服务重启后设备/用户的回答偏好可恢复。
 */
@Repository
@ConditionalOnProperty(name = "sanye.ai.preference-store", havingValue = "pg", matchIfMissing = true)
public class JdbcPreferenceStore implements PreferenceStore {

    private final JdbcTemplate jdbc;
    private final String schema;

    /** 注入偏好数据库，并固定偏好表所属 schema。 */
    public JdbcPreferenceStore(JdbcTemplate jdbc,
                               @Value("${sanye.ai.preference-schema:sanye_ai_chat}") String schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** 返回偏好表名，业务字段仍通过 SQL 参数绑定。 */
    private String table() {
        return schema + ".sanye_ai_preference";
    }

    /** 从 PostgreSQL 读取指定归属键的偏好。 */
    @Override
    public Optional<Preference> get(String ownerKey) {
        List<Preference> rows = jdbc.query(
                "select owner_key, temperature, context_length, model_name, updated_at from " + table()
                        + " where owner_key = ?",
                (rs, rowNum) -> mapPreference(rs), ownerKey);
        return rows.stream().findFirst();
    }

    /** 使用 upsert 保存偏好，确保同一归属键只有当前版本。 */
    @Override
    public Preference save(String ownerKey, Double temperature, Integer contextLength, String modelName, Instant now) {
        int updated = jdbc.update(
                "insert into " + table()
                        + " (owner_key, temperature, context_length, model_name, updated_at) values (?, ?, ?, ?, ?) "
                        + "on conflict (owner_key) do update set temperature = excluded.temperature, "
                        + "context_length = excluded.context_length, model_name = excluded.model_name, "
                        + "updated_at = excluded.updated_at",
                ownerKey, temperature, contextLength, modelName, java.sql.Timestamp.from(now));
        if (updated <= 0) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "偏好保存失败");
        }
        return get(ownerKey).orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "偏好保存失败"));
    }

    /** 将数据库行转换为偏好领域对象。 */
    private Preference mapPreference(ResultSet rs) throws SQLException {
        Double temperature = rs.getObject("temperature") == null ? null : rs.getDouble("temperature");
        Integer contextLength = rs.getObject("context_length") == null ? null : rs.getInt("context_length");
        Instant updatedAt = rs.getTimestamp("updated_at").toInstant();
        return new Preference(rs.getString("owner_key"), temperature, contextLength, rs.getString("model_name"), updatedAt);
    }
}
