package com.sanye.sanye_anime;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.URI;
import java.net.URISyntaxException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "SanyeCatalog")
public class SanyeCatalogPlugin extends Plugin {
    private static final String TAG = "SanyeCatalog";
    private CatalogDatabase database;

    @Override
    public void load() {
        database = new CatalogDatabase(getContext());
        // 首次升级（建索引、回填历史封面）会走一次全表读写。以前它发生在用户第一次调用桥接时，
        // 而所有插件方法共用 Capacitor 的一条 HandlerThread，迁移期间连「读取历史」都要排队等待。
        // 这里在插件装载后就预热一次数据库，把迁移挪到用户操作之前（VQ-60）。
        Thread warmUp = new Thread(() -> {
            try {
                database.getWritableDatabase();
            } catch (Exception failure) {
                // 迁移失败留给后续调用按各自的错误码上报，这里只记录原因。
                Log.e(TAG, "本地片库预热失败", failure);
            }
        }, "sanye-android-catalog-warmup");
        warmUp.setDaemon(true);
        warmUp.start();
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (database != null) database.close();
        } catch (Exception failure) {
            Log.w(TAG, "关闭本地片库失败", failure);
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void list(PluginCall call) {
        // 只关游标，不关数据库：getReadableDatabase() 返回的是帮助器缓存的那一个实例，
        // 用 try-with-resources 关掉它会让每次读取都重开连接并丢掉页缓存。
        try (Cursor rows = database.getReadableDatabase().query(
                "saved_media", null, null, null, null, null, "updated_at DESC, id DESC")) {
            JSArray items = new JSArray();
            while (rows.moveToNext()) items.put(toItem(rows));
            JSObject result = new JSObject();
            result.put("items", items);
            call.resolve(result);
        } catch (Exception exception) {
            Log.e(TAG, "读取本地片库失败", exception);
            call.reject("本地片库暂时无法读取", "E_CATALOG_READ", exception);
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String title = call.getString("title", "").trim();
        String url = call.getString("url", "").trim();
        String coverUrl = call.getString("coverUrl", "").trim();
        String summary = call.getString("summary", "").trim();
        Boolean favorite = call.getBoolean("favorite");
        if (title.isEmpty() || title.length() > 120 || !validRecordUrl(url) || !validCoverUrl(coverUrl)
            || (!summary.isEmpty() && !validLabel(summary, 500))) {
            call.reject("请输入作品名称与有效的 HTTPS 媒体地址", "E_CATALOG_PARAM");
            return;
        }
        SQLiteDatabase db = null;
        JSObject item;
        try {
            db = database.getWritableDatabase();
            db.beginTransaction();
            long id;
            try (Cursor existing = db.query("saved_media", new String[]{"id"}, "url = ?", new String[]{url}, null, null, null)) {
                if (existing.moveToFirst()) {
                    id = existing.getLong(0);
                    ContentValues update = new ContentValues();
                    update.put("title", title);
                    if (!coverUrl.isEmpty()) update.put("cover_url", coverUrl);
                    if (!summary.isEmpty()) update.put("summary", summary);
                    if (Boolean.TRUE.equals(favorite)) update.put("favorite", 1);
                    update.put("updated_at", System.currentTimeMillis());
                    db.update("saved_media", update, "id = ?", new String[]{Long.toString(id)});
                } else {
                    ContentValues insert = new ContentValues();
                    insert.put("title", title);
                    insert.put("url", url);
                    insert.put("cover_url", coverUrl);
                    insert.put("summary", summary);
                    insert.put("favorite", Boolean.TRUE.equals(favorite) ? 1 : 0);
                    insert.put("updated_at", System.currentTimeMillis());
                    id = db.insertOrThrow("saved_media", null, insert);
                }
            }
            item = find(db, id);
            db.setTransactionSuccessful();
        } catch (Exception exception) {
            Log.e(TAG, "保存作品失败：" + url, exception);
            call.reject("保存失败，原有片库未更改", "E_CATALOG_WRITE", exception);
            return;
        } finally {
            if (db != null && db.inTransaction()) db.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("item", item);
        call.resolve(result);
    }

    @PluginMethod
    public void setFavorite(PluginCall call) {
        Integer id = call.getInt("id");
        Boolean favorite = call.getBoolean("favorite");
        if (id == null || id <= 0 || favorite == null) {
            call.reject("无效的收藏操作", "E_CATALOG_PARAM");
            return;
        }
        try {
            SQLiteDatabase db = database.getWritableDatabase();
            ContentValues values = new ContentValues();
            values.put("favorite", favorite ? 1 : 0);
            if (db.update("saved_media", values, "id = ?", new String[]{Integer.toString(id)}) != 1) {
                // 作品被删除是并发下的正常情况，不写错误日志，只把结果告诉界面。
                call.reject("作品不存在", "E_CATALOG_NOT_FOUND");
                return;
            }
            JSObject result = new JSObject();
            result.put("item", find(db, id));
            call.resolve(result);
        } catch (Exception exception) {
            Log.e(TAG, "收藏状态保存失败：" + id, exception);
            call.reject("收藏状态保存失败", "E_CATALOG_WRITE", exception);
        }
    }

    // History is deliberately independent of saved_media: watching never imports a title.
    @PluginMethod
    public void recordProgress(PluginCall call) {
        String mediaUrl = call.getString("mediaUrl", "").trim();
        String title = call.getString("title", "").trim();
        String episodeId = call.getString("episodeId", "").trim();
        String episodeTitle = call.getString("episodeTitle", "").trim();
        String lineId = call.getString("lineId", "").trim();
        String coverUrl = call.getString("coverUrl", "").trim();
        Double position = call.getDouble("positionSeconds");
        Double duration = call.getDouble("durationSeconds");
        Boolean completed = call.getBoolean("completed");
        // 选集/线路 id 与条目标题只是展示字段：有的来源没有线路 id，也有的没有条目标题。
        // 以前用非空校验，把这类作品的整条历史一起拒掉（用户看到的是「有的会保存失败」）。
        if (!validRecordUrl(mediaUrl) || !validLabel(title, 120) || !validOptionalLabel(episodeId, 256)
            || !validOptionalLabel(episodeTitle, 120) || !validOptionalLabel(lineId, 256)
            || !validCoverUrl(coverUrl)
            || !validProgress(position, duration) || completed == null) {
            call.reject("观看进度参数无效", "E_CATALOG_PARAM");
            return;
        }
        SQLiteDatabase db = null;
        JSObject item;
        long updatedAt = System.currentTimeMillis();
        try {
            db = database.getWritableDatabase();
            db.beginTransaction();
            ContentValues values = new ContentValues();
            values.put("media_url", mediaUrl);
            values.put("title", title);
            values.put("episode_id", episodeId);
            values.put("episode_title", episodeTitle);
            values.put("line_id", lineId);
            // 历史卡片要显示封面：播放时把当前作品的封面一起存下来，应用升级后仍可用。
            values.put("cover_url", coverUrl);
            values.put("position_seconds", position);
            values.put("duration_seconds", duration);
            values.put("completed", completed ? 1 : 0);
            values.put("updated_at", updatedAt);
            // A conflict only replaces the same episode on the same line and media URL.
            // 用插入返回值判成败，不再回读同一条记录（VQ-60）：播放中每 5 秒保存一次，
            // 回读只为拿 updated_at，而它本来就在本地变量里。
            if (db.insertWithOnConflict("watch_history", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) {
                throw new IllegalStateException("历史写入失败");
            }
            item = historyItem(historyValues(mediaUrl, title, episodeId, episodeTitle, lineId, coverUrl, position, duration, completed, updatedAt));
            db.setTransactionSuccessful();
        } catch (Exception exception) {
            Log.e(TAG, "观看进度保存失败：" + mediaUrl, exception);
            call.reject("观看进度保存失败，原有历史未更改", "E_CATALOG_WRITE", exception);
            return;
        } finally {
            if (db != null && db.inTransaction()) db.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("item", item);
        call.resolve(result);
    }

    @PluginMethod
    public void listHistory(PluginCall call) {
        // 同上只关游标。历史条数按 upsert 累积，这里不截断用户数据，改用索引兜住排序开销。
        try (Cursor rows = database.getReadableDatabase().query("watch_history", null, null, null, null, null,
                "updated_at DESC, media_url ASC, episode_id ASC, line_id ASC")) {
            JSArray items = new JSArray();
            while (rows.moveToNext()) items.put(toHistory(rows));
            JSObject result = new JSObject();
            result.put("items", items);
            call.resolve(result);
        } catch (Exception exception) {
            Log.e(TAG, "读取观看历史失败", exception);
            call.reject("观看历史暂时无法读取", "E_CATALOG_READ", exception);
        }
    }

    @PluginMethod
    public void clearHistory(PluginCall call) {
        SQLiteDatabase db = null;
        int removed;
        try {
            db = database.getWritableDatabase();
            db.beginTransaction();
            removed = db.delete("watch_history", null, null);
            db.setTransactionSuccessful();
        } catch (Exception exception) {
            Log.e(TAG, "观看历史清理失败", exception);
            call.reject("观看历史清理失败", "E_CATALOG_WRITE", exception);
            return;
        } finally {
            if (db != null && db.inTransaction()) db.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("removed", removed);
        call.resolve(result);
    }

    @PluginMethod
    public void getSettings(PluginCall call) {
        SQLiteDatabase db = database.getReadableDatabase();
        try {
            JSObject result = new JSObject();
            result.put("settings", readSettings(db));
            call.resolve(result);
        } catch (Exception exception) {
            Log.e(TAG, "读取设置失败", exception);
            call.reject("设置暂时无法读取", "E_CATALOG_READ", exception);
        }
    }

    @PluginMethod
    public void setSettings(PluginCall call) {
        JSObject settings = call.getObject("settings");
        if (settings == null || settings.length() == 0) {
            call.reject("设置参数无效", "E_CATALOG_PARAM");
            return;
        }
        ContentValues[] updates = new ContentValues[settings.length()];
        int index = 0;
        try {
            java.util.Iterator<String> keys = settings.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = settings.get(key);
                if (!validSetting(key, value)) {
                    call.reject("设置参数无效", "E_CATALOG_PARAM");
                    return;
                }
                ContentValues entry = new ContentValues();
                entry.put("key", key);
                entry.put("value", value.toString());
                updates[index++] = entry;
            }
        } catch (JSONException exception) {
            call.reject("设置参数无效", "E_CATALOG_PARAM");
            return;
        }
        SQLiteDatabase db = null;
        JSObject saved;
        try {
            db = database.getWritableDatabase();
            db.beginTransaction();
            for (ContentValues update : updates) db.insertWithOnConflict("app_settings", null, update, SQLiteDatabase.CONFLICT_REPLACE);
            saved = readSettings(db);
            db.setTransactionSuccessful();
        } catch (Exception exception) {
            Log.e(TAG, "设置保存失败", exception);
            call.reject("设置保存失败，原有设置未更改", "E_CATALOG_WRITE", exception);
            return;
        } finally {
            if (db != null && db.inTransaction()) db.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("settings", saved);
        call.resolve(result);
    }

    @PluginMethod
    public void clearMediaCache(PluginCall call) {
        // Never traverse the application files directory or the SQLite database directory.
        File mediaCache = new File(getContext().getCacheDir(), "sanye_media_cache");
        try {
            int removed = deleteMediaCache(mediaCache);
            JSObject result = new JSObject();
            result.put("removed", removed);
            call.resolve(result);
        } catch (IOException exception) {
            Log.e(TAG, "媒体缓存清理失败", exception);
            call.reject("媒体缓存清理失败，请重试", "E_CATALOG_DELETE", exception);
        }
    }

    /** 返回已删除的文件与子目录总数（不含缓存根目录自身）。 */
    private static int deleteMediaCache(File directory) throws IOException {
        if (!directory.exists()) return 0;
        if (!directory.isDirectory() || Files.isSymbolicLink(directory.toPath())) throw new IOException("缓存路径不是目录");
        File[] children = directory.listFiles();
        if (children == null) throw new IOException("缓存目录无法读取");
        int count = 0;
        for (File child : children) {
            if (Files.isSymbolicLink(child.toPath())) throw new IOException("缓存包含符号链接");
            // 子目录本身也算删除一项：以前只计文件，界面显示的数量与真正清掉的东西不一致。
            if (child.isDirectory()) count += 1 + deleteMediaCache(child);
            else if (child.isFile() && child.delete()) count++;
            else throw new IOException("缓存文件无法删除");
        }
        if (!directory.delete()) throw new IOException("缓存目录无法删除");
        return count;
    }

    static boolean validLabel(String input, int limit) {
        return !input.isEmpty() && input.length() <= limit && !input.matches(".*[\\p{Cntrl}].*");
    }

    /** 可缺省文本：允许空串，但仍然限制长度与控制字符。 */
    static boolean validOptionalLabel(String input, int limit) {
        return input.length() <= limit && !input.matches(".*[\\p{Cntrl}].*");
    }

    static boolean validProgress(Double position, Double duration) {
        return position != null && duration != null && Double.isFinite(position) && Double.isFinite(duration)
            && position >= 0 && duration >= 0 && position <= 8640000 && duration <= 8640000
            && (duration == 0 || position <= duration);
    }

    static boolean validSetting(String key, Object value) {
        if ("theme".equals(key)) return value instanceof String && ("system".equals(value) || "light".equals(value) || "dark".equals(value));
        if ("autoPlay".equals(key)) return value instanceof Boolean;
        if ("playbackRate".equals(key)) return value instanceof Number && Double.isFinite(((Number) value).doubleValue())
            && ((Number) value).doubleValue() >= 0.5 && ((Number) value).doubleValue() <= 2.0;
        // 画质与帧率档位只接受菜单里存在的值：安卓端画质开放性能/均衡/锐化三档
        //（锐化在持续超预算时由自动降档退回性能），帧率档与 PC 的 FRAME_RATE_OPTIONS 一致，
        // 避免落盘一个播放器认不出的档位。
        if ("qualityProfile".equals(key)) return value instanceof String
            && ("off".equals(value) || "fast".equals(value) || "balanced".equals(value) || "sharp".equals(value));
        // 帧率档：早期客户端把档位当数字发过来（60/90/…），原生只认字符串时会整条 reject，
        // 用户看到的是「设置保存失败」且档位永远存不下来。两种写法都收下，统一按字符串入库。
        if ("frameTarget".equals(key)) {
            String target = value instanceof String ? (String) value
                : value instanceof Number ? String.valueOf(((Number) value).intValue()) : null;
            return target != null && ("off".equals(target) || "auto".equals(target) || "60".equals(target)
                || "90".equals(target) || "120".equals(target) || "144".equals(target)
                || "165".equals(target) || "240".equals(target));
        }
        // 音量（VQ-61）：与 PC 端一样随设置落盘，0 表示静音；只接受 0~1 的有限数，避免落盘一个播放器认不出的值。
        if ("volume".equals(key)) return value instanceof Number && Double.isFinite(((Number) value).doubleValue())
            && ((Number) value).doubleValue() >= 0 && ((Number) value).doubleValue() <= 1;
        return false;
    }

    private static JSObject readSettings(SQLiteDatabase db) {
        JSObject settings = new JSObject();
        settings.put("theme", "system");
        settings.put("autoPlay", false);
        settings.put("playbackRate", 1.0);
        settings.put("qualityProfile", "off");
        settings.put("frameTarget", "off");
        settings.put("volume", 1.0);
        try (Cursor rows = db.query("app_settings", null, null, null, null, null, null)) {
            while (rows.moveToNext()) {
                String key = rows.getString(rows.getColumnIndexOrThrow("key"));
                String value = rows.getString(rows.getColumnIndexOrThrow("value"));
                if ("theme".equals(key) && validSetting(key, value)) settings.put(key, value);
                else if ("autoPlay".equals(key) && ("true".equals(value) || "false".equals(value))) settings.put(key, Boolean.parseBoolean(value));
                else if ("qualityProfile".equals(key) && validSetting(key, value)) settings.put(key, value);
                else if ("frameTarget".equals(key) && validSetting(key, value)) settings.put(key, value);
                else if ("playbackRate".equals(key)) {
                    try {
                        double rate = Double.parseDouble(value);
                        if (validSetting(key, rate)) settings.put(key, rate);
                    } catch (NumberFormatException ignored) { /* use default */ }
                }
                else if ("volume".equals(key)) {
                    try {
                        double volume = Double.parseDouble(value);
                        if (validSetting(key, volume)) settings.put(key, volume);
                    } catch (NumberFormatException ignored) { /* use default */ }
                }
            }
        }
        return settings;
    }

    private static JSObject toHistory(Cursor row) {
        JSObject item = new JSObject();
        item.put("mediaUrl", row.getString(row.getColumnIndexOrThrow("media_url")));
        item.put("title", row.getString(row.getColumnIndexOrThrow("title")));
        item.put("episodeId", row.getString(row.getColumnIndexOrThrow("episode_id")));
        item.put("episodeTitle", row.getString(row.getColumnIndexOrThrow("episode_title")));
        item.put("lineId", row.getString(row.getColumnIndexOrThrow("line_id")));
        item.put("coverUrl", row.getString(row.getColumnIndexOrThrow("cover_url")));
        item.put("positionSeconds", row.getDouble(row.getColumnIndexOrThrow("position_seconds")));
        item.put("durationSeconds", row.getDouble(row.getColumnIndexOrThrow("duration_seconds")));
        item.put("completed", row.getInt(row.getColumnIndexOrThrow("completed")) != 0);
        item.put("updatedAt", row.getLong(row.getColumnIndexOrThrow("updated_at")));
        return item;
    }

    /**
     * 写入成功后的返回项：字段与 {@link #toHistory(Cursor)} 完全一致，但不再回读数据库。
     * 这里先组装成有序 Map，单测可以直接核对字段名与取值（JSObject 继承 android 的 JSONObject，
     * JVM 单测里无法实例化）。
     */
    static java.util.Map<String, Object> historyValues(String mediaUrl, String title, String episodeId, String episodeTitle,
        String lineId, String coverUrl, double positionSeconds, double durationSeconds, boolean completed, long updatedAt) {
        java.util.Map<String, Object> values = new java.util.LinkedHashMap<>();
        values.put("mediaUrl", mediaUrl);
        values.put("title", title);
        values.put("episodeId", episodeId);
        values.put("episodeTitle", episodeTitle);
        values.put("lineId", lineId);
        values.put("coverUrl", coverUrl);
        values.put("positionSeconds", positionSeconds);
        values.put("durationSeconds", durationSeconds);
        values.put("completed", completed);
        values.put("updatedAt", updatedAt);
        return values;
    }

    private static JSObject historyItem(java.util.Map<String, Object> values) {
        JSObject item = new JSObject();
        for (java.util.Map.Entry<String, Object> entry : values.entrySet()) item.put(entry.getKey(), entry.getValue());
        return item;
    }

    static boolean validUrl(String input) {
        if (input.length() > 2048) return false;
        try {
            URI uri = new URI(input);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getFragment() != null || uri.getRawQuery() != null) return false;
            String normalized = host.toLowerCase(Locale.ROOT).replaceFirst("\\.$", "");
            return normalized.contains(".") && !normalized.contains(":") && !normalized.matches("[0-9.]+")
                && !normalized.endsWith(".local") && !normalized.endsWith(".localhost")
                && !normalized.endsWith(".internal");
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    /**
     * 历史封面入库校验：随包相对封面（/assets/…）与公网 https 图床都可以入库。
     * 来源封面域名无法预先穷举，只保留「https + 公网域名 + 无凭证/片段/非标准端口」这条底线；
     * 能不能真正加载交给图片元素，失败会退到随包占位图。
     */
    /**
     * 作品身份地址（保存的作品地址、观看历史的 mediaUrl）。
     *
     * 这些地址是来源站的播放页地址，天生可能带查询参数（`?from=search`）或片段；
     * 以前直接复用「直链媒体」的 `validUrl`，只要带一个查询参数就整条拒绝，
     * 用户看到的是「播放进度保存失败」——历史永远写不进去。这里只保留
     * https、公网域名、无凭证、无控制字符这条底线，不做查询参数限制。
     */
    static boolean validRecordUrl(String input) {
        if (input.length() > 2048 || input.matches(".*[\\p{Cntrl}].*")) return false;
        try {
            URI uri = new URI(input);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null) return false;
            String normalized = host.toLowerCase(Locale.ROOT).replaceFirst("\\.$", "");
            return normalized.contains(".") && !normalized.contains(":") && !normalized.matches("[0-9.]+")
                && !normalized.endsWith(".local") && !normalized.endsWith(".localhost")
                && !normalized.endsWith(".internal");
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    static boolean validCoverUrl(String input) {
        if (input.isEmpty()) return true;
        if (input.length() > 2048 || input.matches(".*[\\p{Cntrl}].*")) return false;
        if (input.startsWith("/assets/")) return !input.contains("..");
        try {
            URI uri = new URI(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null
                || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            String host = uri.getHost();
            if (host == null) return false;
            String normalized = host.toLowerCase(Locale.ROOT).replaceFirst("\\.$", "");
            return normalized.contains(".") && !normalized.contains(":") && !normalized.matches("[0-9.]+")
                && !normalized.endsWith(".local") && !normalized.endsWith(".localhost")
                && !normalized.endsWith(".internal");
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private static JSObject find(SQLiteDatabase db, long id) {
        try (Cursor rows = db.query("saved_media", null, "id = ?", new String[]{Long.toString(id)}, null, null, null)) {
            if (!rows.moveToFirst()) throw new IllegalStateException("作品不存在");
            return toItem(rows);
        }
    }

    private static JSObject toItem(Cursor row) {
        JSObject item = new JSObject();
        item.put("id", row.getLong(row.getColumnIndexOrThrow("id")));
        item.put("title", row.getString(row.getColumnIndexOrThrow("title")));
        item.put("url", row.getString(row.getColumnIndexOrThrow("url")));
        item.put("coverUrl", row.getString(row.getColumnIndexOrThrow("cover_url")));
        item.put("summary", row.getString(row.getColumnIndexOrThrow("summary")));
        item.put("favorite", row.getInt(row.getColumnIndexOrThrow("favorite")) != 0);
        item.put("updatedAt", row.getLong(row.getColumnIndexOrThrow("updated_at")));
        return item;
    }

    private static final class CatalogDatabase extends SQLiteOpenHelper {
        private static final int DATABASE_VERSION = 7;

        CatalogDatabase(android.content.Context context) {
            super(context, "sanye_catalog.db", null, DATABASE_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE saved_media (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, favorite INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, cover_url TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '')");
            createPersonalDataTables(db);
            createSavedMediaIndex(db);
            createSavedMediaTitleIndex(db);
            createHistorySortIndex(db);
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            if (oldVersion < 1 || oldVersion > newVersion || newVersion != DATABASE_VERSION)
                throw new IllegalStateException("不支持的本地片库版本");
            // v7 的标题索引必须排在任何数据回填之前：v6 的封面回填按 saved_media.title 关联，
            // 而 title 上没有索引时，每一行历史都会全表扫一遍片库（VQ-60）。
            if (oldVersion < 7) createSavedMediaTitleIndex(db);
            if (oldVersion < 2) createPersonalDataTables(db);
            // watch_history 建好之后才能给它加排序索引（v1 的老库走到这里才刚有这张表）。
            if (oldVersion < 7) createHistorySortIndex(db);
            if (oldVersion < 3) {
                db.execSQL("ALTER TABLE saved_media ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
                db.execSQL("ALTER TABLE saved_media ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
            }
            // v4：观看历史保存封面，历史卡片可以直接显示封面而不是退回占位图。
            if (oldVersion < 4) db.execSQL("ALTER TABLE watch_history ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
            // v5：片库本来就按 updated_at DESC 读取，但只给 watch_history 建过索引。
            if (oldVersion < 5) createSavedMediaIndex(db);
            // v6：历史封面回填。封面字段是后来才加的，老记录一直是空串，用户看到的就是
            //「观看历史没有封面」。同一作品在片库里已有封面时按地址、再按标题补一次。
            if (oldVersion < 6) backfillHistoryCovers(db);
        }

        private static void backfillHistoryCovers(SQLiteDatabase db) {
            db.execSQL("UPDATE watch_history SET cover_url = (SELECT cover_url FROM saved_media"
                + " WHERE saved_media.url = watch_history.media_url AND cover_url <> '' LIMIT 1)"
                + " WHERE cover_url = ''");
            db.execSQL("UPDATE watch_history SET cover_url = (SELECT cover_url FROM saved_media"
                + " WHERE saved_media.title = watch_history.title AND cover_url <> '' LIMIT 1)"
                + " WHERE cover_url = ''");
        }

        private static void createSavedMediaIndex(SQLiteDatabase db) {
            db.execSQL("CREATE INDEX IF NOT EXISTS saved_media_recent ON saved_media (updated_at DESC, id DESC)");
        }

        /** v7：v6 封面回填按标题关联片库，没有这个索引时是 O(历史条数 × 片库条数) 的全表扫描。 */
        private static void createSavedMediaTitleIndex(SQLiteDatabase db) {
            db.execSQL("CREATE INDEX IF NOT EXISTS saved_media_title ON saved_media (title)");
        }

        /**
         * v7：历史排序是四列（`updated_at DESC, media_url ASC, episode_id ASC, line_id ASC`），
         * 只有 `updated_at DESC` 时 SQLite 仍要建临时 B 树把整表排一遍；索引列与排序完全一致后
         * 可以按索引顺序直接读，避免历史越长进入页面越慢（VQ-60）。
         */
        private static void createHistorySortIndex(SQLiteDatabase db) {
            db.execSQL("CREATE INDEX IF NOT EXISTS watch_history_recent_full ON watch_history"
                + " (updated_at DESC, media_url ASC, episode_id ASC, line_id ASC)");
        }

        private static void createPersonalDataTables(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE watch_history (media_url TEXT NOT NULL, title TEXT NOT NULL, episode_id TEXT NOT NULL, episode_title TEXT NOT NULL, line_id TEXT NOT NULL, position_seconds REAL NOT NULL, duration_seconds REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, cover_url TEXT NOT NULL DEFAULT '', PRIMARY KEY (media_url, episode_id, line_id))");
            db.execSQL("CREATE INDEX watch_history_recent ON watch_history (updated_at DESC)");
            db.execSQL("CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
        }
    }
}
