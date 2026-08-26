package com.sanye.anime.sanye_ai_chat.store;

import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 内存会话存储（联调基线，线程安全）。服务重启数据丢失，仅用于开发联调；
 * 正式持久化在 T-E-02 以 PostgreSQL 实现替换。
 */
@Repository
@ConditionalOnProperty(name = "sanye.ai.conversation-store", havingValue = "memory")
public class InMemoryConversationStore implements ConversationStore {

    private static final Logger log = LoggerFactory.getLogger(InMemoryConversationStore.class);

    private final AtomicLong conversationSeq = new AtomicLong(1);
    private final AtomicLong messageSeq = new AtomicLong(1);
    private final Map<Long, Conversation> conversations = new ConcurrentHashMap<>();
    private final Map<Long, Message> messages = new ConcurrentHashMap<>();

    /** 创建进程内会话并初始化活动状态。 */
    @Override
    public ConversationView create(String ownerKey, String title, String spoilerMode, Long contextAnimeId) {
        long id = conversationSeq.getAndIncrement();
        String now = Instant.now().toString();
        Conversation conversation = new Conversation(id, ownerKey, title, "ACTIVE", spoilerMode, contextAnimeId, now, now);
        conversations.put(id, conversation);
        log.info("创建会话 conversationId={} owner={} spoilerMode={} contextAnimeId={}", id, ownerKey, spoilerMode, contextAnimeId);
        return toView(conversation);
    }

    /** 查询并校验内存会话归属。 */
    @Override
    public ConversationView get(String ownerKey, long conversationId) {
        return toView(requireOwned(ownerKey, conversationId));
    }

    /** 按更新时间倒序返回内存会话分页。 */
    @Override
    public List<ConversationView> list(String ownerKey, int page, int size) {
        return conversations.values().stream()
                .filter(c -> c.ownerKey().equals(ownerKey))
                .sorted(Comparator.comparing(Conversation::updatedAt).reversed())
                .skip((long) (page - 1) * size)
                .limit(size)
                .map(this::toView)
                .toList();
    }

    /** 更新内存会话的非空字段和更新时间。 */
    @Override
    public ConversationView update(String ownerKey, long conversationId, String title, String spoilerMode,
                                   Long contextAnimeId, String status) {
        Conversation conversation = requireOwned(ownerKey, conversationId);
        if (title != null && !title.isBlank()) {
            conversation = conversation.withTitle(title.trim());
        }
        if (spoilerMode != null && !spoilerMode.isBlank()) {
            conversation = conversation.withSpoilerMode(spoilerMode);
        }
        if (contextAnimeId != null) {
            conversation = conversation.withContextAnimeId(contextAnimeId);
        }
        if (status != null && !status.isBlank()) {
            conversation = conversation.withStatus(status);
        }
        conversation = conversation.withUpdatedAt(Instant.now().toString());
        conversations.put(conversationId, conversation);
        return toView(conversation);
    }

    /** 删除会话并移除其全部内存消息。 */
    @Override
    public void delete(String ownerKey, long conversationId) {
        requireOwned(ownerKey, conversationId);
        conversations.remove(conversationId);
        messages.values().removeIf(m -> m.conversationId() == conversationId);
        log.info("删除会话 conversationId={} owner={}", conversationId, ownerKey);
    }

    /** 统计指定归属键的内存会话数量。 */
    @Override
    public long count(String ownerKey) {
        return conversations.values().stream().filter(c -> c.ownerKey().equals(ownerKey)).count();
    }

    /** 幂等写入用户消息并更新会话时间。 */
    @Override
    public long addUserMessage(String ownerKey, long conversationId, String clientMessageId, String content, String spoilerMode) {
        long existing = userMessageIdByClientKey(conversationId, clientMessageId);
        if (existing > 0) {
            return existing;
        }
        requireOwned(ownerKey, conversationId);
        Conversation conversation = conversations.get(conversationId);
        conversations.put(conversationId, conversation.withUpdatedAt(Instant.now().toString()));
        long id = messageSeq.getAndIncrement();
        Message message = new Message(id, conversationId, "USER", content, "COMPLETED", 1, null,
                Instant.now().toString(), clientMessageId);
        messages.put(id, message);
        return id;
    }

    /** 创建生成中的助手消息占位记录。 */
    @Override
    public long createAssistantMessage(String ownerKey, long conversationId, String clientMessageId, int generateTry) {
        requireOwned(ownerKey, conversationId);
        long id = messageSeq.getAndIncrement();
        Message message = new Message(id, conversationId, "ASSISTANT", "", "GENERATING", generateTry, null,
                Instant.now().toString());
        messages.put(id, message);
        return id;
    }

    /** 查询指定会话中的消息并校验所有权。 */
    @Override
    public MessageView getMessage(String ownerKey, long conversationId, long messageId) {
        requireOwned(ownerKey, conversationId);
        Message message = messages.get(messageId);
        if (message == null || message.conversationId() != conversationId) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return toView(message);
    }

    /** 按消息编号查询并校验消息所属会话。 */
    @Override
    public MessageView getMessageByOwnerAndId(String ownerKey, long messageId) {
        Message message = messages.get(messageId);
        if (message == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        requireOwned(ownerKey, message.conversationId());
        return toView(message);
    }

    /** 返回会话消息，并按编号支持增量读取。 */
    @Override
    public List<MessageView> messages(String ownerKey, long conversationId, Long after) {
        requireOwned(ownerKey, conversationId);
        return messages.values().stream()
                .filter(m -> m.conversationId() == conversationId)
                .filter(m -> after == null || m.id() > after)
                .sorted(Comparator.comparingLong(Message::id))
                .map(this::toView)
                .toList();
    }

    /** 追加助手流式片段，消息不存在时忽略断线回调。 */
    @Override
    public void appendAssistantDelta(long messageId, String delta) {
        Message message = messages.get(messageId);
        if (message == null) {
            return;
        }
        messages.put(messageId, message.withContent(message.content() + delta));
    }

    /** 替换助手消息全文，供安全过滤修正回答。 */
    @Override
    public void replaceMessageContent(long messageId, String content) {
        Message message = messages.get(messageId);
        if (message == null) {
            return;
        }
        messages.put(messageId, message.withContent(content));
    }

    /** 更新助手消息最终状态。 */
    @Override
    public void completeMessage(long messageId, String status) {
        Message message = messages.get(messageId);
        if (message == null) {
            return;
        }
        messages.put(messageId, message.withStatus(status));
    }

    /** 保存推荐卡片列表。 */
    @Override
    public void setRecommendations(long messageId, List<RecommendationView> recommendations) {
        Message message = messages.get(messageId);
        if (message == null) {
            return;
        }
        messages.put(messageId, message.withRecommendations(recommendations));
    }

    /** 增加重生成次数并重置消息正文和状态。 */
    @Override
    public int incrementGenerateTry(long messageId) {
        Message message = messages.get(messageId);
        if (message == null) {
            return 1;
        }
        int next = message.generateTry() + 1;
        messages.put(messageId, message.withGenerateTry(next).withContent("").withStatus("GENERATING"));
        return next;
    }

    /** 按客户端消息编号查找已有用户消息。 */
    @Override
    public long userMessageIdByClientKey(long conversationId, String clientMessageId) {
        return messages.values().stream()
                .filter(m -> m.conversationId() == conversationId && m.role().equals("USER"))
                .filter(m -> clientMessageId != null && clientMessageId.equals(m.clientMessageId()))
                .map(Message::id)
                .findFirst()
                .orElse(0L);
    }

    /** 判断内存会话是否属于指定归属键。 */
    @Override
    public boolean belongsToOwner(String ownerKey, long conversationId) {
        Conversation conversation = conversations.get(conversationId);
        return conversation != null && conversation.ownerKey().equals(ownerKey);
    }

    /** 查询会话的归属键，供记忆窗口重建使用。 */
    @Override
    public String ownerOf(long conversationId) {
        Conversation conversation = conversations.get(conversationId);
        if (conversation == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return conversation.ownerKey();
    }

    /** 查询归属人的全部会话编号。 */
    @Override
    public List<Long> conversationIdsOf(String ownerKey) {
        return conversations.values().stream()
                .filter(c -> c.ownerKey().equals(ownerKey))
                .map(Conversation::id)
                .toList();
    }

    /** 校验会话存在且属于当前归属键。 */
    private Conversation requireOwned(String ownerKey, long conversationId) {
        Conversation conversation = conversations.get(conversationId);
        if (conversation == null || !conversation.ownerKey().equals(ownerKey)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return conversation;
    }

    /** 将内存会话和最后一条消息转换为接口视图。 */
    private ConversationView toView(Conversation conversation) {
        String lastMessage = messages.values().stream()
                .filter(m -> m.conversationId() == conversation.id() && !m.role().equals("SYSTEM"))
                .max(Comparator.comparingLong(Message::id))
                .map(m -> m.content() == null || m.content().isBlank() ? "" : truncate(m.content(), 50))
                .orElse("");
        return new ConversationView(conversation.id(), conversation.title(), conversation.status(),
                conversation.spoilerMode(), conversation.contextAnimeId(), lastMessage,
                conversation.createdAt(), conversation.updatedAt());
    }

    /** 将内存消息转换为接口视图。 */
    private MessageView toView(Message message) {
        return new MessageView(message.id(), message.conversationId(), message.role(), message.content(),
                message.status(), message.generateTry(), message.recommendations(), message.createdAt());
    }

    /** 截断会话列表摘要，避免长消息撑开列表。 */
    private static String truncate(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    private record Conversation(long id, String ownerKey, String title, String status, String spoilerMode,
                                Long contextAnimeId, String createdAt, String updatedAt) {
        /** 创建仅替换标题的新会话记录。 */
        Conversation withTitle(String title) {
            return new Conversation(id, ownerKey, title, status, spoilerMode, contextAnimeId, createdAt, updatedAt);
        }

        /** 创建仅替换状态的新会话记录。 */
        Conversation withStatus(String status) {
            return new Conversation(id, ownerKey, title, status, spoilerMode, contextAnimeId, createdAt, updatedAt);
        }

        /** 创建仅替换剧透模式的新会话记录。 */
        Conversation withSpoilerMode(String spoilerMode) {
            return new Conversation(id, ownerKey, title, status, spoilerMode, contextAnimeId, createdAt, updatedAt);
        }

        /** 创建仅替换上下文作品的新会话记录。 */
        Conversation withContextAnimeId(Long contextAnimeId) {
            return new Conversation(id, ownerKey, title, status, spoilerMode, contextAnimeId, createdAt, updatedAt);
        }

        /** 创建仅替换更新时间的新会话记录。 */
        Conversation withUpdatedAt(String updatedAt) {
            return new Conversation(id, ownerKey, title, status, spoilerMode, contextAnimeId, createdAt, updatedAt);
        }
    }

    private record Message(long id, long conversationId, String role, String content, String status, int generateTry,
                           List<RecommendationView> recommendations, String createdAt, String clientMessageId) {
        /** 构造没有客户端幂等键的助手消息记录。 */
        Message(long id, long conversationId, String role, String content, String status, int generateTry,
                List<RecommendationView> recommendations, String createdAt) {
            this(id, conversationId, role, content, status, generateTry, recommendations, createdAt, null);
        }

        /** 创建仅替换正文的新消息记录。 */
        Message withContent(String content) {
            return new Message(id, conversationId, role, content, status, generateTry, recommendations, createdAt, clientMessageId);
        }

        /** 创建仅替换状态的新消息记录。 */
        Message withStatus(String status) {
            return new Message(id, conversationId, role, content, status, generateTry, recommendations, createdAt, clientMessageId);
        }

        /** 创建仅替换重试次数的新消息记录。 */
        Message withGenerateTry(int generateTry) {
            return new Message(id, conversationId, role, content, status, generateTry, recommendations, createdAt, clientMessageId);
        }

        /** 创建仅替换推荐卡片的新消息记录。 */
        Message withRecommendations(List<RecommendationView> recommendations) {
            return new Message(id, conversationId, role, content, status, generateTry, recommendations, createdAt, clientMessageId);
        }
    }
}
