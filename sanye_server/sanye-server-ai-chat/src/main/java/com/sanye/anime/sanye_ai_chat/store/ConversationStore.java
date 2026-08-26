package com.sanye.anime.sanye_ai_chat.store;

import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;

import java.util.List;

/**
 * 会话与消息存储抽象。联调阶段使用内存实现；T-E-02 会话与消息持久化时替换为 PostgreSQL 实现，
 * 对外契约保持不变。
 */
public interface ConversationStore {

    /** 创建归属当前用户或设备的会话。 */
    ConversationView create(String ownerKey, String title, String spoilerMode, Long contextAnimeId);

    /** 查询会话并校验归属。 */
    ConversationView get(String ownerKey, long conversationId);

    /** 查询归属人的会话分页。 */
    List<ConversationView> list(String ownerKey, int page, int size);

    /** 更新会话元数据并返回最新视图。 */
    ConversationView update(String ownerKey, long conversationId, String title, String spoilerMode,
                            Long contextAnimeId, String status);

    /** 删除会话及其消息。 */
    void delete(String ownerKey, long conversationId);

    /** 统计归属人的会话数量。 */
    long count(String ownerKey);

    /**
     * 记录用户消息，返回消息 id；若同一 (conversationId, clientMessageId) 已存在则返回已有消息 id。
     */
    long addUserMessage(String ownerKey, long conversationId, String clientMessageId, String content, String spoilerMode);

    /**
     * 创建助手消息占位，返回消息 id。
     */
    long createAssistantMessage(String ownerKey, long conversationId, String clientMessageId, int generateTry);

    /** 按会话查询消息并校验归属。 */
    MessageView getMessage(String ownerKey, long conversationId, long messageId);

    /**
     * 按消息 id 查询并校验所属会话所有权。
     */
    MessageView getMessageByOwnerAndId(String ownerKey, long messageId);

    /** 查询会话消息，after 用于增量读取。 */
    List<MessageView> messages(String ownerKey, long conversationId, Long after);

    /** 追加助手流式增量文本。 */
    void appendAssistantDelta(long messageId, String delta);

    /** 替换助手完整正文，用于安全过滤后的修正。 */
    void replaceMessageContent(long messageId, String content);

    /** 更新消息生成状态。 */
    void completeMessage(long messageId, String status);

    /** 保存消息关联的推荐卡片。 */
    void setRecommendations(long messageId, List<RecommendationView> recommendations);

    /** 增加重生成次数并重置助手消息内容。 */
    int incrementGenerateTry(long messageId);

    /** 按客户端幂等键查询已有用户消息。 */
    long userMessageIdByClientKey(long conversationId, String clientMessageId);

    /** 判断会话是否属于指定用户或设备。 */
    boolean belongsToOwner(String ownerKey, long conversationId);

    /**
     * 查询会话所属 owner_key（记忆窗口按设备偏好重建时使用）。
     */
    String ownerOf(long conversationId);

    /**
     * 查询某 owner 的全部会话 ID（偏好变更后失效其记忆窗口）。
     */
    List<Long> conversationIdsOf(String ownerKey);
}
