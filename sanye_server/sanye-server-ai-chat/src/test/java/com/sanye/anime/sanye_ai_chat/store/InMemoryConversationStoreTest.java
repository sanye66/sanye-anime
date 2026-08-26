package com.sanye.anime.sanye_ai_chat.store;

import com.sanye.anime.sanye_ai_chat.model.ConversationView;
import com.sanye.anime.sanye_ai_chat.model.MessageView;
import com.sanye.anime.sanye_ai_chat.model.RecommendationView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryConversationStoreTest {

    private final InMemoryConversationStore store = new InMemoryConversationStore();

    @Test
    void conversationCrudAndOwnership() {
        ConversationView created = store.create("device:d1", "标题", "SAFE", 1L);
        assertEquals("ACTIVE", created.status());
        assertEquals(1, store.list("device:d1", 1, 20).size());
        assertEquals(1, store.count("device:d1"));

        store.update("device:d1", created.id(), "新标题", "ALLOW", 2L, "ARCHIVED");
        ConversationView updated = store.get("device:d1", created.id());
        assertEquals("新标题", updated.title());
        assertEquals("ALLOW", updated.spoilerMode());
        assertEquals(2L, updated.contextAnimeId());

        assertTrue(store.belongsToOwner("device:d1", created.id()));
        assertFalse(store.belongsToOwner("device:other", created.id()));
        assertThrows(BusinessException.class, () -> store.get("device:other", created.id()));

        store.delete("device:d1", created.id());
        assertThrows(BusinessException.class, () -> store.get("device:d1", created.id()));
        assertEquals(0, store.count("device:d1"));
    }

    @Test
    void messageFlowIdempotencyAndRegenerate() {
        ConversationView conversation = store.create("device:d1", "标题", "SAFE", null);
        long userMessageId = store.addUserMessage("device:d1", conversation.id(), "cm-1", "你好", "SAFE");
        assertEquals(userMessageId, store.addUserMessage("device:d1", conversation.id(), "cm-1", "你好", "SAFE"));
        assertEquals(userMessageId, store.userMessageIdByClientKey(conversation.id(), "cm-1"));

        long assistantId = store.createAssistantMessage("device:d1", conversation.id(), "cm-1", 1);
        store.appendAssistantDelta(assistantId, "回答");
        store.appendAssistantDelta(assistantId, "内容");
        store.setRecommendations(assistantId, List.of(new RecommendationView(2, "夏末余晖", "理由")));
        store.completeMessage(assistantId, "COMPLETED");

        MessageView message = store.getMessage("device:d1", conversation.id(), assistantId);
        assertEquals("回答内容", message.content());
        assertEquals("COMPLETED", message.status());
        assertEquals(1, message.recommendations().size());

        List<MessageView> after = store.messages("device:d1", conversation.id(), userMessageId);
        assertEquals(1, after.size());
        assertEquals(assistantId, after.get(0).id());

        assertEquals(2, store.incrementGenerateTry(assistantId));
        assertThrows(BusinessException.class, () -> store.getMessage("device:other", conversation.id(), assistantId));
        assertThrows(BusinessException.class, () -> store.getMessageByOwnerAndId("device:other", assistantId));
        assertEquals("", store.getMessageByOwnerAndId("device:d1", assistantId).content());
        assertEquals("GENERATING", store.getMessageByOwnerAndId("device:d1", assistantId).status());
    }
}
