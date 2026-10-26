package com.sanye.sanye_anime;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** 备份只携带个人数据；校验阶段不接触数据库，任何错误都先于事务写入。 */
final class PersonalDataBackup {
    static final int MAX_BYTES = 10 * 1024 * 1024;
    static final int MAX_RECORDS = 10000;
    static final String FORMAT = "sanye-personal-data";
    final JsonArray savedMedia;
    final JsonArray watchHistory;
    final JsonObject settings;
    final long exportedAt;

    private PersonalDataBackup(JsonObject data) {
        savedMedia = data.getAsJsonArray("savedMedia");
        watchHistory = data.getAsJsonArray("watchHistory");
        settings = data.getAsJsonObject("settings");
        exportedAt = integer(data, "exportedAt");
    }

    static PersonalDataBackup parse(String content) {
        try {
            if (content == null || content.length() > MAX_BYTES
                || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) fail();
            JsonReader reader = new JsonReader(new StringReader(content));
            reader.setStrictness(Strictness.STRICT);
            JsonElement parsed = JsonParser.parseReader(reader);
            if (reader.peek() != JsonToken.END_DOCUMENT || !parsed.isJsonObject()) fail();
            JsonObject data = parsed.getAsJsonObject();
            keys(data, Set.of("format", "version", "exportedAt", "savedMedia", "watchHistory", "settings"));
            if (!FORMAT.equals(string(data, "format")) || (integer(data, "version") != 1 && integer(data, "version") != 2)) fail();
            integer(data, "exportedAt");
            if (!data.has("savedMedia") || !data.get("savedMedia").isJsonArray()
                || !data.has("watchHistory") || !data.get("watchHistory").isJsonArray()
                || !data.has("settings") || !data.get("settings").isJsonObject()) fail();
            PersonalDataBackup backup = new PersonalDataBackup(data);
            if (backup.savedMedia.size() > MAX_RECORDS || backup.watchHistory.size() > MAX_RECORDS) fail();
            Set<String> urls = new HashSet<>();
            Set<Long> ids = new HashSet<>();
            for (JsonElement element : backup.savedMedia) {
                if (!element.isJsonObject()) fail();
                JsonObject item = element.getAsJsonObject();
                keys(item, Set.of("id", "title", "url", "coverUrl", "summary", "favorite", "updatedAt", "sourceKey", "sourceContext"));
                SourceIdentity source = SourceIdentity.parse(item);
                String url = string(item, "url");
                if (!SanyeCatalogPlugin.validRecordUrl(url) || !urls.add(url + "\u0000" + source.key)
                    || !SanyeCatalogPlugin.validLabel(string(item, "title"), 120)
                    || !SanyeCatalogPlugin.validCoverUrl(string(item, "coverUrl"))
                    || !SanyeCatalogPlugin.validOptionalLabel(string(item, "summary"), 500)) fail();
                bool(item, "favorite");
                integer(item, "updatedAt");
                if (item.has("id")) {
                    long id = integer(item, "id");
                    if (id == 0 || !ids.add(id)) fail();
                }
            }
            Set<java.util.List<String>> historyKeys = new HashSet<>();
            for (JsonElement element : backup.watchHistory) {
                if (!element.isJsonObject()) fail();
                JsonObject item = element.getAsJsonObject();
                keys(item, Set.of("mediaUrl", "title", "episodeId", "episodeTitle", "lineId", "coverUrl",
                    "positionSeconds", "durationSeconds", "completed", "updatedAt", "sourceKey", "sourceContext"));
                SourceIdentity source = SourceIdentity.parse(item);
                String url = string(item, "mediaUrl"), episode = string(item, "episodeId"), line = string(item, "lineId");
                if (!SanyeCatalogPlugin.validRecordUrl(url)
                    || !historyKeys.add(java.util.List.of(url, episode, line, source.key))
                    || !SanyeCatalogPlugin.validLabel(string(item, "title"), 120)
                    || !SanyeCatalogPlugin.validOptionalLabel(episode, 256)
                    || !SanyeCatalogPlugin.validOptionalLabel(line, 256)
                    || !SanyeCatalogPlugin.validOptionalLabel(string(item, "episodeTitle"), 120)
                    || !SanyeCatalogPlugin.validCoverUrl(string(item, "coverUrl"))
                    || !SanyeCatalogPlugin.validProgress(number(item, "positionSeconds"), number(item, "durationSeconds"))) fail();
                bool(item, "completed");
                integer(item, "updatedAt");
            }
            for (Map.Entry<String, JsonElement> setting : backup.settings.entrySet()) {
                Object value = new Gson().fromJson(setting.getValue(), Object.class);
                if (!SanyeCatalogPlugin.validSetting(setting.getKey(), value)) fail();
                // 原设置桥接兼容数字档位；备份不允许把 60.5 截断为合法的 60。
                if ("frameTarget".equals(setting.getKey()) && value instanceof Number) {
                    double numeric = ((Number) value).doubleValue();
                    if (!Double.isFinite(numeric) || numeric != Math.rint(numeric)) fail();
                }
            }
            return backup;
        } catch (Exception failure) {
            throw new IllegalArgumentException("备份格式、版本或个人数据无效", failure);
        }
    }

    private static void keys(JsonObject object, Set<String> allowed) {
        if (!allowed.containsAll(object.keySet())) fail();
    }

    static String string(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) fail();
        return value.getAsString();
    }

    static boolean bool(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean()) fail();
        return value.getAsBoolean();
    }

    static double number(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) fail();
        double result = value.getAsDouble();
        if (!Double.isFinite(result)) fail();
        return result;
    }

    static long integer(JsonObject object, String key) {
        double value = number(object, key);
        if (value < 0 || value > 9007199254740991L || value != Math.rint(value)) fail();
        return (long) value;
    }

    private static void fail() { throw new IllegalArgumentException("备份数据无效"); }
}
