package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.*;
import org.junit.Assume;
import org.junit.Test;

public class SubscriptionPageFetchPolicyTest {
    @Test public void announcedSitePagesAreReadableThroughAndroidFetchPolicy() throws Exception {
        Assume.assumeTrue("仅在本地显式请求时探测外部站点", "1".equals(System.getenv("SANYE_ANDROID_LIVE_SITE")));
        for (String[] site : new String[][]{
                {"https://fcccc.cc", "/k/1-{page}/", "/p/45121/", "/v/45121-1-1/"},
                {"https://omofun.org.cn", "/h/1-{page}/", "/p/52685/", "/v/52685-1-1/"}}) {
            String base = site[0];
            String rule = """
                {"exportedMediaSourceDataList":{"mediaSources":[{"factoryId":"web-selector","version":2,"arguments":{
                  "name":"现场来源","searchConfig":{"searchUrl":"BASE/u/?wd={keyword}","subjectFormatId":"a",
                  "selectorSubjectFormatA":{"selectLists":"article.u-movie > a[title][href^='/p/']"},
                  "channelFormatId":"no-channel","selectorChannelFormatNoChannel":{"selectEpisodes":"#video_list_li .vlink a"}},
                  "repositoryConfig":{"version":1,"url":"BASECATEGORY","subjectFormatId":"a",
                  "selectorSubjectFormatA":{"selectLists":"article.u-movie > a[title][href^='/p/']"},
                  "selectNextPage":"li.next-page a:contains(下一页)"}}}]}}
                """.replace("BASE", base).replace("CATEGORY", site[1]);
            SubscriptionSourceEngine engine = new SubscriptionSourceEngine();
            assertFalse(base, engine.search(rule, "你的名字").getAsJsonArray("hits").isEmpty());
            assertFalse(base, engine.repository(rule, 0, 1).getAsJsonArray("hits").isEmpty());
            assertFalse(base, engine.preview(rule, base + site[2], 0).getAsJsonArray("episodes").isEmpty());
            assertTrue(base, engine.resolve(rule, base + site[3], 0).get("playbackUrl").getAsString().startsWith("https://"));
        }
    }

    @Test public void successivePagesKeepSharedClientAliveAndAllowCompression() throws Exception {
        OkHttpClient client = CoverFetchPolicy.client().newBuilder().addInterceptor(chain -> {
            assertNotEquals("identity", chain.request().header("Accept-Encoding"));
            return response(chain.request(), 200, null, "<html>作品</html>".getBytes(java.nio.charset.StandardCharsets.UTF_8), "text/html");
        }).build();
        SubscriptionPageFetchPolicy.fetch("https://source.example.com/search", client);
        assertFalse(client.dispatcher().executorService().isShutdown());
        assertEquals("<html>作品</html>", SubscriptionPageFetchPolicy.fetch("https://source.example.com/detail", client));
        client.dispatcher().executorService().shutdown();
    }
    private static Response response(Request request, int code, String location, byte[] bytes, String type) {
        Response.Builder result = new Response.Builder().request(request).protocol(Protocol.HTTP_1_1)
                .code(code).message("test").body(ResponseBody.create(MediaType.parse(type), bytes));
        if (location != null) result.header("Location", location);
        return result.build();
    }
    @Test public void followsValidatedHttpsPageRedirectAndDecodesDeclaredCharset() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        byte[] body = "<html>你的名字</html>".getBytes(Charset.forName("GBK"));
        OkHttpClient client = CoverFetchPolicy.client().newBuilder().addInterceptor(chain -> {
            assertTrue(chain.request().header("Accept").startsWith("text/html"));
            if (calls.getAndIncrement() == 0) return response(chain.request(), 302, "/final", new byte[0], "text/html");
            assertEquals("/final", chain.request().url().encodedPath());
            return response(chain.request(), 200, null, body, "text/html;charset=GBK");
        }).build();
        assertEquals("<html>你的名字</html>", SubscriptionPageFetchPolicy.fetch("https://source.example.com/start", client));
        assertEquals(2, calls.get());
    }
    @Test public void rejectsPrivateDowngradedAndCredentialRedirectsAndOversizedPages() {
        for (String url : new String[]{"http://source.example.com/play", "https://localhost/play", "https://user:secret@source.example.com/play"}) {
            OkHttpClient client = CoverFetchPolicy.client().newBuilder().addInterceptor(chain -> response(chain.request(), 302, url, new byte[0], "text/html")).build();
            assertThrows(Exception.class, () -> SubscriptionPageFetchPolicy.fetch("https://source.example.com/play", client));
        }
        OkHttpClient large = CoverFetchPolicy.client().newBuilder().addInterceptor(chain -> response(chain.request(), 200, null,
                new byte[SubscriptionFetchPolicy.MAX_BYTES + 1], "text/html")).build();
        assertThrows(IOException.class, () -> SubscriptionPageFetchPolicy.fetch("https://source.example.com/play", large));
    }
}
