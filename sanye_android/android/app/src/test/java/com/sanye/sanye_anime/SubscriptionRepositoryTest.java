package com.sanye.sanye_anime;

import com.google.gson.*;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class SubscriptionRepositoryTest {
    @Test public void announcedSitePresetsKeepSearchDirectoryEpisodesAndMediaOnTheirOwnHosts() throws Exception {
        for (String[] site : new String[][]{
                {"https://fcccc.cc", "/k/1-{page}/"},
                {"https://omofun.org.cn", "/h/1-{page}/"}}) {
            String base = site[0], category = site[1];
            JsonObject rule = JsonParser.parseString("""
                {"factoryId":"web-selector","version":2,"arguments":{"name":"站点",
                "searchConfig":{"searchUrl":"BASE/u/?wd={keyword}","subjectFormatId":"a",
                  "selectorSubjectFormatA":{"selectLists":"article.u-movie > a[title][href^='/p/']"},
                  "channelFormatId":"no-channel","selectorChannelFormatNoChannel":{"selectEpisodes":"#video_list_li .vlink a"}},
                "repositoryConfig":{"version":1,"url":"BASECATEGORY","subjectFormatId":"a",
                  "selectorSubjectFormatA":{"selectLists":"article.u-movie > a[title][href^='/p/']"},
                  "selectNextPage":"li.next-page a:contains(下一页)"}}}
                """.replace("BASE", base).replace("CATEGORY", category)).getAsJsonObject();
            String card = "<article class='u-movie'><a title='你的名字' href='/p/10/'><div class='list-poster'>"
                    + "<img data-original='https://img.example.org/poster.jpg'></div><h2>你的名字</h2></a></article>";
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> {
                if (url.contains("/u/")) return card;
                if (url.contains("/p/")) return "<h1>你的名字</h1><div id='video_list_li'><div class='vlink'>"
                        + "<a href='/v/10-1-1/'>第01集</a></div></div>";
                if (url.contains("/v/")) return "<script>var player_aaaa={\"url\":\"https://media.example.org/one.m3u8\",\"encrypt\":0}</script>";
                return card + "<li class='next-page'><a href='" + category.replace("{page}", "2") + "'>下一页</a></li>";
            }, host -> new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8")});
            String configured = content(rule);
            JsonObject hit = engine.search(configured, "你的名字").getAsJsonArray("hits").get(0).getAsJsonObject();
            assertEquals(base + "/p/10/", hit.get("sourceUrl").getAsString());
            assertEquals("https://img.example.org/poster.jpg", hit.get("coverUrl").getAsString());
            JsonObject page = engine.repository(configured, 0, 1);
            assertTrue(page.get("hasMore").getAsBoolean());
            JsonObject episode = engine.preview(configured, base + "/p/10/", 0).getAsJsonArray("episodes").get(0).getAsJsonObject();
            assertEquals(base + "/v/10-1-1/", episode.get("sourceUrl").getAsString());
            assertEquals("https://media.example.org/one.m3u8", engine.resolve(configured, base + "/v/10-1-1/", 0).get("playbackUrl").getAsString());
        }
    }

    @Test public void wedmCatalogSelectorsReadPagedTitlesCoversAndNextLink() throws Exception {
        JsonObject rule = JsonParser.parseString("""
            {"factoryId":"web-selector","version":2,"arguments":{"name":"wedm",
              "searchConfig":{"searchUrl":"https://www.vdm5.com/search_-------------.html?wd={keyword}","subjectFormatId":"a","channelFormatId":"index-grouped"},
              "repositoryConfig":{"version":1,"url":"https://www.vdm5.com/show_ribendongman--------{page}---.html",
                "subjectFormatId":"a","selectorSubjectFormatA":{"selectLists":".stui-vodlist__box .stui-vodlist__detail h4.title a"},
                "selectNextPage":"a:contains(下一页)"}}}
            """).getAsJsonObject();
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> url.contains("--------1---")
            ? "<div class='stui-vodlist__box'><a class='stui-vodlist__thumb' href='/vodetail_one.html' data-original='https://img.example.org/one.jpg'></a>"
                + "<div class='stui-vodlist__detail'><h4 class='title'><a href='/vodetail_one.html'>作品一</a></h4></div></div>"
                + "<ul><li><a href='/show_ribendongman--------2---.html'>下一页</a></li></ul>"
            : "<div class='stui-vodlist__box'><a class='stui-vodlist__thumb' href='/vodetail_two.html' data-original='https://img.example.org/two.jpg'></a>"
                + "<div class='stui-vodlist__detail'><h4 class='title'><a href='/vodetail_two.html'>作品二</a></h4></div></div>");
        String configured = content(rule);
        JsonObject capability = engine.capabilities(configured).getAsJsonArray("sources").get(0).getAsJsonObject();
        assertTrue(capability.toString(), capability.get("repository").getAsBoolean());
        JsonObject first = engine.repository(configured, 0, 1);
        JsonObject hit = first.getAsJsonArray("hits").get(0).getAsJsonObject();
        assertEquals("作品一", hit.get("title").getAsString());
        assertEquals("https://www.vdm5.com/vodetail_one.html", hit.get("sourceUrl").getAsString());
        assertEquals("https://img.example.org/one.jpg", hit.get("coverUrl").getAsString());
        assertTrue(first.get("hasMore").getAsBoolean());
        assertEquals("作品二", engine.repository(configured, 0, 2).getAsJsonArray("hits").get(0).getAsJsonObject().get("title").getAsString());
    }

    private JsonObject source(String name) {
        return JsonParser.parseString("""
            {"factoryId":"web-selector","version":2,"arguments":{"name":"名称",
            "searchConfig":{"searchUrl":"https://example.com/search?q={keyword}","subjectFormatId":"a","channelFormatId":"no-channel",
            "selectorSubjectFormatA":{"selectLists":"h2 a"}},
            "repositoryConfig":{"version":1,"url":"https://example.com/catalog/{page}","subjectFormatId":"a",
            "selectorSubjectFormatA":{"selectLists":"h2 a"},"selectNextPage":"a.next"}}}
            """).getAsJsonObject();
    }
    private String content(JsonObject... sources) {
        JsonArray list = new JsonArray();
        for (JsonObject source : sources) list.add(source);
        JsonObject exported = new JsonObject(); exported.add("mediaSources", list);
        JsonObject root = new JsonObject(); root.add("exportedMediaSourceDataList", exported);
        return root.toString();
    }
    @Test public void explicitDirectoryUsesOnlySelectedSourceAndActualNextLink() throws Exception {
        JsonObject unsupported = JsonParser.parseString("{\"factoryId\":\"script\",\"version\":1,\"arguments\":{}}").getAsJsonObject();
        List<String> requests = new ArrayList<>();
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> {
            requests.add(url);
            return url.endsWith("/1") ? "<h2><a href='/work/1'>作品一</a></h2><h2><a href='/work/1'>重复</a></h2><a class='next' href='/catalog/2'>下一页</a>"
                    : "<h2><a href='/work/2'>作品二</a></h2>";
        });
        String content = content(unsupported, source("目录"), source("其他"));
        JsonObject first = engine.repository(content, 1, 1);
        assertEquals(1, first.getAsJsonArray("hits").size());
        assertEquals(1, first.getAsJsonArray("hits").get(0).getAsJsonObject().get("sourceIndex").getAsInt());
        assertTrue(first.get("hasMore").getAsBoolean()); assertEquals(2, first.get("nextPage").getAsInt());
        JsonObject last = engine.repository(content, 1, 2);
        assertFalse(last.get("hasMore").getAsBoolean()); assertFalse(last.has("nextPage"));
        assertEquals(List.of("https://example.com/catalog/1", "https://example.com/catalog/2"), requests);
        JsonArray caps = engine.capabilities(content).getAsJsonArray("sources");
        assertFalse(caps.get(0).getAsJsonObject().get("search").getAsBoolean());
        assertEquals("unsupported", caps.get(0).getAsJsonObject().get("playback").getAsString());
        assertTrue(caps.get(1).getAsJsonObject().get("repository").getAsBoolean());
        assertEquals("static-only", caps.get(1).getAsJsonObject().get("playback").getAsString());
        assertEquals(2, requests.size());
    }
    @Test public void missingOrInvalidDeclarationMakesNoRequestAndSearchStillWorks() throws Exception {
        List<String> requests = new ArrayList<>();
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> { requests.add(url); return "<h2><a href='/work/1'>作品</a></h2>"; });
        JsonObject source = source("目录"); source.getAsJsonObject("arguments").remove("repositoryConfig");
        assertFalse(engine.capabilities(content(source)).getAsJsonArray("sources").get(0).getAsJsonObject().get("repository").getAsBoolean());
        try { engine.repository(content(source), 0, 1); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("未声明")); }
        assertTrue(requests.isEmpty());
        assertEquals(1, engine.search(content(source), "作品").getAsJsonArray("hits").size());
        assertTrue(requests.get(0).contains("search?q="));
    }
    @Test public void unsafeAndForeignDirectoryAddressesAndUnsupportedRulesCannotFetch() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> { fail("非法声明不得发请求"); return ""; });
        for (String url : List.of("http://example.com/list", "https://127.0.0.1/list", "https://other.example.org/list")) {
            JsonObject source = source("目录"), config = source.getAsJsonObject("arguments").getAsJsonObject("repositoryConfig");
            config.addProperty("url", url); config.remove("selectNextPage");
            assertFalse(engine.capabilities(content(source)).getAsJsonArray("sources").get(0).getAsJsonObject().get("repository").getAsBoolean());
            try { engine.repository(content(source), 0, 1); fail(); } catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
        }
        JsonObject source = source("目录"); source.addProperty("factoryId", "script");
        try { engine.repository(content(source), 0, 1); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("静态")); }
    }
    @Test public void nextLinksAndEntriesCannotCrossSources() throws Exception {
        for (String html : List.of("<h2><a href='https://other.example.org/work'>外站</a></h2>", "<a class='next' href='https://other.example.org/catalog/2'>下一页</a>", "<a class='next' href='/catalog/4'>跳页</a>")) {
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> html);
            try { engine.repository(content(source("目录")), 0, 1); fail(); } catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
        }
    }
    @Test public void singlePageAndIndexedSelectorsHaveIndependentContract() throws Exception {
        JsonObject source = source("目录"), config = source.getAsJsonObject("arguments").getAsJsonObject("repositoryConfig");
        config.addProperty("url", "https://example.com/list"); config.remove("selectNextPage"); config.addProperty("subjectFormatId", "indexed");
        JsonObject selector = new JsonObject(); selector.addProperty("selectLinks", ".card a"); selector.addProperty("selectNames", ".card strong");
        config.add("selectorSubjectFormatIndexed", selector);
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> "<div class='card'><a href='/work/7'><img src='/poster.jpg'></a><strong>目录标题</strong></div>");
        JsonObject result = engine.repository(content(source), 0, 1);
        JsonObject hit = result.getAsJsonArray("hits").get(0).getAsJsonObject();
        assertEquals("目录标题", hit.get("title").getAsString()); assertEquals("https://example.com/poster.jpg", hit.get("coverUrl").getAsString());
        assertFalse(result.get("hasMore").getAsBoolean());
        try { engine.repository(content(source), 0, 2); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("未声明分页")); }
    }
    @Test public void invalidPageAndIndexAreRejectedBeforeFetch() throws Exception {
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> { fail(); return ""; });
        for (int page : new int[]{-1, 0, 10001}) try { engine.repository(content(source("目录")), 0, page); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("页码")); }
        for (int index : new int[]{-1, 1}) try { engine.repository(content(source("目录")), index, 1); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("索引")); }
        JsonObject source = source("目录"); source.getAsJsonObject("arguments").getAsJsonObject("repositoryConfig").remove("selectNextPage");
        try { engine.repository(content(source), 0, 1); fail(); } catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("同时声明")); }
    }
    @Test public void singlePageSafetyCapIsReportedRatherThanPretendingComplete() throws Exception {
        StringBuilder html = new StringBuilder();
        for (int index = 0; index < 110; index++) html.append("<h2><a href='/work/").append(index).append("'>作品</a></h2>");
        SubscriptionSourceEngine engine = new SubscriptionSourceEngine(url -> html.toString());
        JsonObject result = engine.repository(content(source("目录")), 0, 1);
        assertEquals(100, result.getAsJsonArray("hits").size()); assertTrue(result.get("truncated").getAsBoolean());
        assertEquals(1, result.getAsJsonArray("warnings").size()); assertFalse(result.get("hasMore").getAsBoolean());
    }
}
