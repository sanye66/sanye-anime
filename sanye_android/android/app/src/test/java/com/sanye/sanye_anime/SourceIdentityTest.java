package com.sanye.sanye_anime;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;
import static org.junit.Assert.*;

public class SourceIdentityTest {
    private JsonObject item(String content, Integer index) {
        JsonObject context = new JsonObject();
        context.addProperty("content", content);
        if (index != null) context.addProperty("sourceIndex", index);
        JsonObject item = new JsonObject();
        item.add("sourceContext", context);
        return item;
    }

    private String rules(String name) {
        return "{\"exportedMediaSourceDataList\":{\"mediaSources\":[{\"factoryId\":\"rss\",\"version\":1,\"arguments\":{\"name\":\"" + name + "\"}}]}}";
    }

    @Test public void exactRulesAndIndexDefineStableIdentity() {
        SourceIdentity first = SourceIdentity.parse(item(rules("a"), 0));
        assertEquals(64, first.key.length());
        assertEquals(first.key, SourceIdentity.parse(item(rules("a"), 0)).key);
        assertNotEquals(first.key, SourceIdentity.parse(item(rules("b"), 0)).key);
        assertNotEquals(first.key, SourceIdentity.parse(item(rules("a"), null)).key);
        assertEquals("", SourceIdentity.parse(new JsonObject()).key);
        assertEquals("", SourceIdentity.parse(item("", null)).key);
        JsonObject forged = item(rules("a"), 0);
        forged.addProperty("sourceKey", "0".repeat(64));
        assertThrows(IllegalArgumentException.class, () -> SourceIdentity.parse(forged));
        assertThrows(IllegalArgumentException.class, () -> SourceIdentity.parse(item(rules("a"), 1)));
    }

    @Test public void backupsAcceptDistinctSourcesAndRejectDuplicateOrForgedIdentity() {
        JsonObject backup = JsonParser.parseString("{\"format\":\"sanye-personal-data\",\"version\":2,\"exportedAt\":10,\"savedMedia\":[],\"watchHistory\":[],\"settings\":{}}").getAsJsonObject();
        JsonObject saved = JsonParser.parseString("{\"id\":1,\"title\":\"a\",\"url\":\"https://example.org/video\",\"coverUrl\":\"\",\"summary\":\"\",\"favorite\":true,\"updatedAt\":1}").getAsJsonObject();
        saved.add("sourceContext", item(rules("a"), 0).get("sourceContext"));
        backup.getAsJsonArray("savedMedia").add(saved);
        JsonObject second = saved.deepCopy();
        second.addProperty("id", 2);
        second.add("sourceContext", item(rules("b"), 0).get("sourceContext"));
        backup.getAsJsonArray("savedMedia").add(second);
        assertEquals(2, PersonalDataBackup.parse(backup.toString()).savedMedia.size());
        second.add("sourceContext", saved.get("sourceContext"));
        assertThrows(IllegalArgumentException.class, () -> PersonalDataBackup.parse(backup.toString()));
    }
}
