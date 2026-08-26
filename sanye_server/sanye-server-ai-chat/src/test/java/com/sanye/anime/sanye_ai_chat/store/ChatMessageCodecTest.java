package com.sanye.anime.sanye_ai_chat.store;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ChatMessageCodecTest {

    @Test
    void userMessageRoundTrip() {
        ChatMessage decoded = ChatMessageCodec.messageOf("USER", "帮我推荐动漫");
        assertTrue(decoded instanceof UserMessage);
        assertEquals("帮我推荐动漫", ((UserMessage) decoded).singleText());
        assertEquals("USER", ChatMessageCodec.roleOf(decoded));
    }

    @Test
    void assistantMessageRoundTrip() {
        ChatMessage decoded = ChatMessageCodec.messageOf("ASSISTANT", "我推荐《纸月计划》");
        assertTrue(decoded instanceof AiMessage);
        assertEquals("我推荐《纸月计划》", ((AiMessage) decoded).text());
        assertEquals("ASSISTANT", ChatMessageCodec.roleOf(decoded));
    }

    @Test
    void systemMessageRoundTrip() {
        ChatMessage decoded = ChatMessageCodec.messageOf("SYSTEM", "避免剧透");
        assertTrue(decoded instanceof SystemMessage);
        assertEquals("避免剧透", ((SystemMessage) decoded).text());
        assertEquals("SYSTEM", ChatMessageCodec.roleOf(decoded));
    }

    @Test
    void unknownRoleRejected() {
        assertThrows(IllegalArgumentException.class, () -> ChatMessageCodec.messageOf("ROBOT", "hi"));
    }

    private static void assertTrue(boolean condition) {
        org.junit.jupiter.api.Assertions.assertTrue(condition);
    }
}
