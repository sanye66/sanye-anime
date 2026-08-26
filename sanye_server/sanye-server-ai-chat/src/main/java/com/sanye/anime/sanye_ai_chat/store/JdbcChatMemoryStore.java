package com.sanye.anime.sanye_ai_chat.store;

import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * PG 会话记忆存储（T-E-01）：按 memory_id（会话 id）全量覆盖写入，
 * 供 MessageWindowChatMemory 持久化最近 20 条消息；服务重启后 AI 上下文可恢复。
 */
@Repository
@ConditionalOnProperty(name = "sanye.ai.memory-store", havingValue = "pg", matchIfMissing = true)
public class JdbcChatMemoryStore implements ChatMemoryStore {

    private final JdbcTemplate jdbc;
    private final String table;

    /** 注入记忆表访问模板，并按受控 schema 固定目标表。 */
    public JdbcChatMemoryStore(JdbcTemplate jdbc,
                               @Value("${sanye.ai.memory-schema:sanye_ai_chat}") String schema) {
        this.jdbc = jdbc;
        this.table = schema + ".sanye_ai_chat_memory";
    }

    /** 按会话编号读取持久化记忆消息。 */
    @Override
    public List<ChatMessage> getMessages(Object memoryId) {
        return jdbc.query(
                "select role, content from " + table + " where memory_id = ? order by id",
                (rs, rowNum) -> ChatMessageCodec.messageOf(rs.getString("role"), rs.getString("content")),
                memoryId);
    }

    /** 事务覆盖写入记忆窗口，保持数据库内容与 LangChain4j 窗口一致。 */
    @Override
    @Transactional
    public void updateMessages(Object memoryId, List<ChatMessage> messages) {
        jdbc.update("delete from " + table + " where memory_id = ?", memoryId);
        for (ChatMessage message : messages) {
            jdbc.update(
                    "insert into " + table + " (memory_id, role, content) values (?, ?, ?)",
                    memoryId, ChatMessageCodec.roleOf(message), ChatMessageCodec.textOf(message));
        }
    }

    /** 删除指定会话的持久化记忆。 */
    @Override
    public void deleteMessages(Object memoryId) {
        jdbc.update("delete from " + table + " where memory_id = ?", memoryId);
    }
}
