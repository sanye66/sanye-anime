package com.sanye.sanye_anime;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class SourceIdentity {
    final String key;
    final String context;
    private SourceIdentity(String key, String context) { this.key = key; this.context = context; }
    static SourceIdentity parse(JsonObject item) {
        if (!item.has("sourceContext")) {
            if (item.has("sourceKey") && !PersonalDataBackup.string(item, "sourceKey").isEmpty()) throw new IllegalArgumentException("source context missing");
            return new SourceIdentity("", "");
        }
        JsonObject source = item.getAsJsonObject("sourceContext");
        if (!java.util.Set.of("content", "sourceIndex").containsAll(source.keySet())) throw new IllegalArgumentException("invalid context fields");
        String content = PersonalDataBackup.string(source, "content");
        if (content.isEmpty() && !source.has("sourceIndex")) {
            if (item.has("sourceKey") && !PersonalDataBackup.string(item, "sourceKey").isEmpty()) throw new IllegalArgumentException("source identity mismatch");
            return new SourceIdentity("", "");
        }
        if (content.isEmpty() || content.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024) throw new IllegalArgumentException("invalid context size");
        com.google.gson.JsonArray sources = JsonParser.parseString(content).getAsJsonObject().getAsJsonObject("exportedMediaSourceDataList").getAsJsonArray("mediaSources");
        if (sources == null || sources.isEmpty() || sources.size() > 100) throw new IllegalArgumentException("invalid rules");
        for (com.google.gson.JsonElement element : sources) {
            JsonObject rule = element.getAsJsonObject();
            if (PersonalDataBackup.string(rule, "factoryId").isBlank() || PersonalDataBackup.integer(rule, "version") < 1
                || PersonalDataBackup.string(rule.getAsJsonObject("arguments"), "name").isBlank()) throw new IllegalArgumentException("invalid source rule");
        }
        String index = "";
        if (source.has("sourceIndex")) {
            long value = PersonalDataBackup.integer(source, "sourceIndex");
            if (value >= sources.size()) throw new IllegalArgumentException("invalid source index");
            index = Long.toString(value);
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest((content + "\u0000" + index).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte value : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            String key = hex.toString();
            if (item.has("sourceKey") && !key.equals(PersonalDataBackup.string(item, "sourceKey"))) throw new IllegalArgumentException("source identity mismatch");
            return new SourceIdentity(key, source.toString());
        } catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException(failure); }
    }
}
