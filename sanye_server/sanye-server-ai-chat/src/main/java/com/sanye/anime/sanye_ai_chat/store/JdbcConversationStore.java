package com.sanye.anime.sanye_ai_chat.store;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * PostgreSQL 会话与消息存储（T-E-02）：替换内存实现，服务重启后会话历史与消息可恢复；
 * 所有权按 owner_key（device:xxx / user:xxx）校验；clientMessageId 幂等由唯一约束兜底。
 */
@Repository
@ConditionalOnProperty(name = "sanye.ai.conversation-store", havingValue = "pg", matchIfMissing = true)
public class JdbcConversationStore implements ConversationStore {

    private static final Logger log = LoggerFactory.getLogger(JdbcConversationStore.class);
    private static final TypeReference<List<RecommendationView>> RECS_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String schema;

    /** 注入会话数据库和 JSON 转换器，按受控 schema 访问两张会话表。 */
    public JdbcConversationStore(JdbcTemplate jdbc, ObjectMapper objectMapper,
                                 @Value("${sanye.ai.conversation-schema:sanye_ai_chat}") String schema) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.schema = schema;
    }

    /** 返回会话表名，表名来自受控 schema 配置。 */
    private String conv() {
        return schema + ".sanye_conversation";
    }

    /** 返回会话消息表名。 */
    private String msg() {
        return schema + ".sanye_conversation_message";
    }

    /** 插入 PostgreSQL 会话并返回完整视图。 */
    @Override
    public ConversationView create(String ownerKey, String title, String spoilerMode, Long contextAnimeId) {
        Long id = jdbc.queryForObject(
                "insert into " + conv()
                        + " (owner_key, title, status, spoiler_mode, context_anime_id) values (?, ?, 'ACTIVE', ?, ?) returning id",
                Long.class, ownerKey, title, spoilerMode, contextAnimeId);
        log.info("创建会话 conversationId={} owner={} spoilerMode={} contextAnimeId={}", id, ownerKey, spoilerMode, contextAnimeId);
        return get(ownerKey, id);
    }

    /** 查询数据库会话并在 SQL 层校验 owner_key。 */
    @Override
    public ConversationView get(String ownerKey, long conversationId) {
        return jdbc.query("select id, owner_key, title, status, spoiler_mode, context_anime_id, created_at, updated_at, "
                        + "(select m.content from " + msg() + " m where m.conversation_id = c.id order by m.id desc limit 1) as last_content "
                        + "from " + conv() + " c where c.id = ? and c.owner_key = ?",
                (rs, rowNum) -> mapConversation(rs), conversationId, ownerKey)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 按更新时间倒序查询数据库会话分页。 */
    @Override
    public List<ConversationView> list(String ownerKey, int page, int size) {
        return jdbc.query("select id, owner_key, title, status, spoiler_mode, context_anime_id, created_at, updated_at, "
                        + "(select m.content from " + msg() + " m where m.conversation_id = c.id order by m.id desc limit 1) as last_content "
                        + "from " + conv() + " c where c.owner_key = ? order by c.updated_at desc limit ? offset ?",
                (rs, rowNum) -> mapConversation(rs), ownerKey, size, (long) (page - 1) * size);
    }

    /** 按非空字段更新会话，并在每次变更时刷新更新时间。 */
    @Override
    public ConversationView update(String ownerKey, long conversationId, String title, String spoilerMode,
                                   Long contextAnimeId, String status) {
        get(ownerKey, conversationId);
        if (title != null && !title.isBlank()) {
            jdbc.update("update " + conv() + " set title = ?, updated_at = now() where id = ? and owner_key = ?",
                    title.trim(), conversationId, ownerKey);
        }
        if (spoilerMode != null && !spoilerMode.isBlank()) {
            jdbc.update("update " + conv() + " set spoiler_mode = ?, updated_at = now() where id = ? and owner_key = ?",
                    spoilerMode, conversationId, ownerKey);
        }
        if (contextAnimeId != null) {
            jdbc.update("update " + conv() + " set context_anime_id = ?, updated_at = now() where id = ? and owner_key = ?",
                    contextAnimeId, conversationId, ownerKey);
        }
        if (status != null && !status.isBlank()) {
            jdbc.update("update " + conv() + " set status = ?, updated_at = now() where id = ? and owner_key = ?",
                    status, conversationId, ownerKey);
        }
        return get(ownerKey, conversationId);
    }

    @Override
    @Transactional
    /** 事务删除会话和消息，避免留下孤立消息记录。 */
    public void delete(String ownerKey, long conversationId) {
        get(ownerKey, conversationId);
        jdbc.update("delete from " + msg() + " where conversation_id = ?", conversationId);
        jdbc.update("delete from " + conv() + " where id = ? and owner_key = ?", conversationId, ownerKey);
        log.info("删除会话 conversationId={} owner={}", conversationId, ownerKey);
    }

    /** 统计数据库中的归属会话数量。 */
    @Override
    public long count(String ownerKey) {
        Long count = jdbc.queryForObject("select count(*) from " + conv() + " where owner_key = ?",
                Long.class, ownerKey);
        return count == null ? 0 : count;
    }

    /** 以客户端幂等键插入用户消息，重复键直接返回原消息编号。 */
    @Override
    public long addUserMessage(String ownerKey, long conversationId, String clientMessageId, String content, String spoilerMode) {
        Long existing = jdbc.query("select id from " + msg() + " where conversation_id = ? and client_message_id = ?",
                (rs, rowNum) -> rs.getLong(1), conversationId, clientMessageId)
                .stream().findFirst().orElse(null);
        if (existing != null) {
            return existing;
        }
        get(ownerKey, conversationId);
        Long id = jdbc.queryForObject(
                "insert into " + msg()
                        + " (conversation_id, client_message_id, role, content, status, generate_try) values (?, ?, 'USER', ?, 'COMPLETED', 1) returning id",
                Long.class, conversationId, clientMessageId, content);
        jdbc.update("update " + conv() + " set updated_at = now() where id = ?", conversationId);
        return id;
    }

    /** 插入生成中的助手消息占位记录。 */
    @Override
    public long createAssistantMessage(String ownerKey, long conversationId, String clientMessageId, int generateTry) {
        get(ownerKey, conversationId);
        Long id = jdbc.queryForObject(
                "insert into " + msg()
                        + " (conversation_id, role, content, status, generate_try) values (?, 'ASSISTANT', '', 'GENERATING', ?) returning id",
                Long.class, conversationId, generateTry);
        return id;
    }

    /** 按会话编号、消息编号和 owner_key 查询消息。 */
    @Override
    public MessageView getMessage(String ownerKey, long conversationId, long messageId) {
        return jdbc.query("select m.id, m.conversation_id, m.role, m.content, m.status, m.generate_try, m.recommend_json, m.created_at "
                        + "from " + msg() + " m join " + conv() + " c on c.id = m.conversation_id "
                        + "where m.id = ? and m.conversation_id = ? and c.owner_key = ?",
                (rs, rowNum) -> mapMessage(rs), messageId, conversationId, ownerKey)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 按消息编号查询并在 SQL 层校验归属。 */
    @Override
    public MessageView getMessageByOwnerAndId(String ownerKey, long messageId) {
        return jdbc.query("select m.id, m.conversation_id, m.role, m.content, m.status, m.generate_try, m.recommend_json, m.created_at "
                        + "from " + msg() + " m join " + conv() + " c on c.id = m.conversation_id "
                        + "where m.id = ? and c.owner_key = ?",
                (rs, rowNum) -> mapMessage(rs), messageId, ownerKey)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 查询会话消息，并根据 after 构造增量 SQL。 */
    @Override
    public List<MessageView> messages(String ownerKey, long conversationId, Long after) {
        get(ownerKey, conversationId);
        String sql = "select id, conversation_id, role, content, status, generate_try, recommend_json, created_at "
                + "from " + msg() + " where conversation_id = ?";
        if (after != null) {
            sql += " and id > ?";
            return jdbc.query(sql + " order by id", (rs, rowNum) -> mapMessage(rs), conversationId, after);
        }
        return jdbc.query(sql + " order by id", (rs, rowNum) -> mapMessage(rs), conversationId);
    }

    /** 使用 PostgreSQL 字符串拼接追加流式助手增量。 */
    @Override
    public void appendAssistantDelta(long messageId, String delta) {
        jdbc.update("update " + msg() + " set content = content || ? where id = ?", delta, messageId);
    }

    /** 替换助手全文，供回答安全过滤后的最终修正。 */
    @Override
    public void replaceMessageContent(long messageId, String content) {
        jdbc.update("update " + msg() + " set content = ? where id = ?", content, messageId);
    }

    /** 更新消息生成状态。 */
    @Override
    public void completeMessage(long messageId, String status) {
        jdbc.update("update " + msg() + " set status = ? where id = ?", status, messageId);
    }

    /** 序列化并保存推荐卡片，序列化失败时保留原消息。 */
    @Override
    public void setRecommendations(long messageId, List<RecommendationView> recommendations) {
        try {
            String json = objectMapper.writeValueAsString(recommendations);
            jdbc.update("update " + msg() + " set recommend_json = cast(? as jsonb) where id = ?", json, messageId);
        } catch (JsonProcessingException ex) {
            log.warn("推荐卡片序列化失败 messageId={} error={}", messageId, ex.getMessage());
        }
    }

    /** 增加生成尝试次数并重置消息正文为生成中。 */
    @Override
    public int incrementGenerateTry(long messageId) {
        jdbc.update("update " + msg() + " set generate_try = generate_try + 1, content = '', status = 'GENERATING' where id = ?",
                messageId);
        Integer next = jdbc.queryForObject("select generate_try from " + msg() + " where id = ?", Integer.class, messageId);
        return next == null ? 1 : next;
    }

    /** 查询客户端幂等键对应的用户消息编号。 */
    @Override
    public long userMessageIdByClientKey(long conversationId, String clientMessageId) {
        return jdbc.query("select id from " + msg() + " where conversation_id = ? and client_message_id = ?",
                (rs, rowNum) -> rs.getLong(1), conversationId, clientMessageId)
                .stream().findFirst().orElse(0L);
    }

    /** 用数据库计数确认会话归属关系。 */
    @Override
    public boolean belongsToOwner(String ownerKey, long conversationId) {
        Integer count = jdbc.queryForObject(
                "select count(*) from " + conv() + " where id = ? and owner_key = ?",
                Integer.class, conversationId, ownerKey);
        return count != null && count > 0;
    }

    /** 查询会话归属键，供偏好变化时失效记忆窗口。 */
    @Override
    public String ownerOf(long conversationId) {
        return jdbc.query("select owner_key from " + conv() + " where id = ?",
                (rs, rowNum) -> rs.getString(1), conversationId)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    /** 返回归属人的全部会话编号。 */
    @Override
    public List<Long> conversationIdsOf(String ownerKey) {
        return jdbc.query("select id from " + conv() + " where owner_key = ? order by id",
                (rs, rowNum) -> rs.getLong(1), ownerKey);
    }

    /** 将会话查询行和最后消息摘要映射为接口视图。 */
    private ConversationView mapConversation(ResultSet rs) throws SQLException {
        String lastContent = rs.getString("last_content");
        String lastMessage = lastContent == null || lastContent.isBlank()
                ? "" : truncate(lastContent, 50);
        return new ConversationView(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("status"),
                rs.getString("spoiler_mode"),
                rs.getObject("context_anime_id") == null ? null : rs.getLong("context_anime_id"),
                lastMessage,
                toIso(rs.getTimestamp("created_at")),
                toIso(rs.getTimestamp("updated_at")));
    }

    /** 将消息查询行和推荐 JSON 映射为接口视图。 */
    private MessageView mapMessage(ResultSet rs) throws SQLException {
        List<RecommendationView> recommendations = List.of();
        String json = rs.getString("recommend_json");
        if (json != null && !json.isBlank()) {
            try {
                recommendations = objectMapper.readValue(json, RECS_TYPE);
            } catch (JsonProcessingException ex) {
                log.warn("推荐卡片反序列化失败 messageId={} error={}", rs.getLong("id"), ex.getMessage());
            }
        }
        return new MessageView(
                rs.getLong("id"),
                rs.getLong("conversation_id"),
                rs.getString("role"),
                rs.getString("content"),
                rs.getString("status"),
                rs.getInt("generate_try"),
                recommendations,
                toIso(rs.getTimestamp("created_at")));
    }

    /** 将数据库时间转换为 ISO 文本，空值使用当前时间兜底。 */
    private static String toIso(Timestamp timestamp) {
        return timestamp == null ? Instant.now().toString() : timestamp.toInstant().toString();
    }

    /** 截断会话列表最后消息摘要。 */
    private static String truncate(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }
}
