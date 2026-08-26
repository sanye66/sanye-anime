package com.sanye.anime.sanye_feedback;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_feedback.model.AdminFeedbackView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 反馈服务（T-F-03 第二批）：客户端提交 → 管理端列表/处理状态闭环。
 */
@Service
public class FeedbackService {

    private static final Logger log = LoggerFactory.getLogger(FeedbackService.class);
    /** 用户反馈允许提交的类型白名单。 */
    private static final Set<String> VALID_TYPES = Set.of("功能建议", "使用问题", "内容错误", "作品导入申请", "其他反馈");
    /** 兼容接口契约和旧客户端曾使用的英文反馈类型。 */
    private static final Map<String, String> TYPE_ALIASES = Map.of(
            "SUGGESTION", "功能建议",
            "AI_ISSUE", "使用问题",
            "CONTENT_ISSUE", "内容错误",
            "ANIME_IMPORT_REQUEST", "作品导入申请",
            "OTHER", "其他反馈");
    /** 管理端允许流转的反馈状态白名单。 */
    private static final Set<String> VALID_STATUSES = Set.of("待处理", "处理中", "已关闭");

    private final JdbcTemplate jdbc;
    private final String schema;

    /** 注入反馈数据库和 schema 配置，集中完成校验、脱敏和状态流转。 */
    public FeedbackService(JdbcTemplate jdbc,
                           @Value("${sanye.feedback.schema:sanye_feedback}") String schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** 校验反馈类型和正文后写入待处理记录。 */
    public long submit(String deviceKey, String type, String content, String contact) {
        String normalizedType = normalizeType(type);
        if (normalizedType == null) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "不支持的反馈类型");
        }
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "反馈内容不能为空");
        }
        if (content.length() > 1500) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "反馈内容不能超过 1500 字");
        }
        Long id = jdbc.queryForObject(
                "insert into " + table()
                        + " (device_key, type, content, contact, status, priority) values (?, ?, ?, ?, '待处理', '中') returning id",
                Long.class, deviceKey, normalizedType, content.trim(), contact);
        log.info("反馈提交 id={} type={}", id, normalizedType);
        return id;
    }

    /** 查询管理列表，并对设备标识和正文做展示层脱敏/截断。 */
    public List<AdminFeedbackView> listAll() {
        return jdbc.query("select id, type, content, contact, device_key, priority, status, created_at "
                        + "from " + table() + " order by id desc",
                (rs, rowNum) -> {
                    String content = rs.getString("content");
                    return new AdminFeedbackView(rs.getLong("id"),
                        truncate(content, 30),
                        maskDevice(rs.getString("device_key")),
                        rs.getString("type"), rs.getString("priority"),
                        rs.getTimestamp("created_at").toInstant().toString(),
                        rs.getString("status"), content, rs.getString("contact"));
                });
    }

    @Transactional
    /** 在事务中更新处理状态并追加操作日志，保证状态与审计记录一致。 */
    public AdminFeedbackView updateStatus(long feedbackId, String status, String operator) {
        if (status == null || !VALID_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "不支持的反馈状态");
        }
        int updated = jdbc.update(
                "update " + table() + " set status = ?, closed_at = case when ? = '已关闭' then now() else closed_at end where id = ?",
                status, status, feedbackId);
        if (updated == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        jdbc.update("insert into " + handleLog()
                        + " (feedback_id, action, note) values (?, ?, ?)",
                feedbackId, "UPDATE_STATUS:" + status, operator);
        return listAll().stream().filter(f -> f.id() == feedbackId).findFirst().orElseThrow();
    }

    /** 返回反馈主表名，schema 由受控配置注入。 */
    private String table() {
        return schema + ".sanye_feedback";
    }

    /** 返回反馈处理日志表名。 */
    private String handleLog() {
        return schema + ".sanye_feedback_handle_log";
    }

    /** 标准化反馈类型，避免前后端枚举形式不一致导致合法导入申请被拒绝。 */
    private static String normalizeType(String type) {
        if (type == null) {
            return null;
        }
        String candidate = type.trim();
        if (VALID_TYPES.contains(candidate)) {
            return candidate;
        }
        return TYPE_ALIASES.get(candidate);
    }

    /** 截断后台列表中的长正文，避免表格被异常长文本撑开。 */
    private static String truncate(String text, int max) {
        if (text == null) {
            return "";
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    /** 仅保留设备标识前缀，避免后台列表暴露完整设备信息。 */
    private static String maskDevice(String deviceKey) {
        if (deviceKey == null || deviceKey.isBlank()) {
            return "匿名";
        }
        return deviceKey.length() <= 8 ? deviceKey : deviceKey.substring(0, 8) + "…";
    }
}
