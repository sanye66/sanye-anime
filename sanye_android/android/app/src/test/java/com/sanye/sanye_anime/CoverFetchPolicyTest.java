package com.sanye.sanye_anime;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.junit.Test;

public class CoverFetchPolicyTest {
    private final byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR3sAAAAASUVORK5CYII=");

    @Test public void repeatedDownloadsReuseTheClientAndConnectionPool() {
        OkHttpClient first = CoverFetchPolicy.client();
        OkHttpClient second = CoverFetchPolicy.client();
        assertSame(first, second);
        assertSame(first.connectionPool(), second.connectionPool());
        assertFalse(first.dispatcher().executorService().isShutdown());
    }

    @Test public void acceptsBoundedImageAndRejectsSpoofedOrOversizedContent() throws Exception {
        assertArrayEquals(png, CoverFetchPolicy.readImage(new ByteArrayInputStream(png), "image/png", png.length).bytes());
        assertThrows(IOException.class, () -> CoverFetchPolicy.readImage(new ByteArrayInputStream(png), "image/jpeg", png.length));
        assertThrows(IOException.class, () -> CoverFetchPolicy.readImage(new ByteArrayInputStream(png), "image/svg+xml", png.length));
        assertThrows(IOException.class, () -> CoverFetchPolicy.readImage(new ByteArrayInputStream(png), "image/png", png.length + 1));
        byte[] oversized = new byte[CoverFetchPolicy.MAX_BYTES + 1];
        assertThrows(IOException.class, () -> CoverFetchPolicy.readImage(new ByteArrayInputStream(oversized), "image/png", -1));
        assertThrows(IOException.class, () -> CoverFetchPolicy.readImage(new ByteArrayInputStream(png), "image/png", oversized.length));
        assertFalse(CoverFetchPolicy.validMagic("xxxxftypxxxxavifxxxx".getBytes(), "image/avif"));
    }

    @Test public void requiresPublicHttpsWithoutCredentialsOrIpLiterals() throws Exception {
        assertEquals("covers.sanye-cdn.com", CoverFetchPolicy.validateUrl("https://covers.sanye-cdn.com/a.png").getHost());
        for (String url : new String[]{"http://covers.sanye-cdn.com/a", "https://u:p@covers.sanye-cdn.com/a", "https://127.0.0.1/a", "https://[::1]/a", "https://covers.local/a", "https://covers.example/a", "https://covers.sanye-cdn.com:444/a"}) {
            assertThrows(url, IOException.class, () -> CoverFetchPolicy.validateUrl(url));
        }
        assertThrows(Exception.class, () -> SubscriptionFetchPolicy.resolvePublic(CoverFetchPolicy.validateUrl("https://covers.sanye-cdn.com/a"), host -> new InetAddress[]{InetAddress.getByName("8.8.8.8"), InetAddress.getByName("127.0.0.1")}));
    }

    @Test public void validatesEveryRedirectAndStopsAfterThree() throws Exception {
        for (String location : new String[]{"http://covers.sanye-cdn.com/a", "https://127.0.0.1/a", "https://u:p@covers.sanye-cdn.com/a"}) {
            OkHttpClient client = redirected(location, new AtomicInteger());
            assertThrows(IOException.class, () -> client.newCall(new Request.Builder().url("https://covers.sanye-cdn.com/a").build()).execute());
        }
        AtomicInteger requests = new AtomicInteger();
        OkHttpClient client = redirected("/again", requests);
        assertThrows(IOException.class, () -> client.newCall(new Request.Builder().url("https://covers.sanye-cdn.com/a").build()).execute());
        assertEquals(CoverFetchPolicy.MAX_REDIRECTS + 1, requests.get());
    }

    @Test public void passesOnlyResolvedPublicAddressesToConnectionAndRejectsMixedDns() throws Exception {
        InetAddress publicAddress = InetAddress.getByName("8.8.8.8");
        AtomicInteger lookups = new AtomicInteger();
        OkHttpClient client = CoverFetchPolicy.client(host -> {
            assertEquals("covers.sanye-cdn.com", host);
            lookups.incrementAndGet();
            return new InetAddress[]{publicAddress};
        });
        assertSame(publicAddress, client.dns().lookup("covers.sanye-cdn.com").get(0));
        assertEquals(1, lookups.get());
        OkHttpClient unsafe = CoverFetchPolicy.client(host -> new InetAddress[]{publicAddress, InetAddress.getByName("192.168.1.2")});
        assertThrows(java.net.UnknownHostException.class, () -> unsafe.dns().lookup("covers.sanye-cdn.com"));
        assertEquals(java.net.Proxy.NO_PROXY, client.proxy());
        assertFalse(client.followRedirects());
        assertFalse(client.followSslRedirects());
    }

    private OkHttpClient redirected(String location, AtomicInteger requests) {
        return CoverFetchPolicy.client().newBuilder().addInterceptor(chain -> {
            requests.incrementAndGet();
            return new Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                    .code(302).message("redirect").header("Location", location).body(ResponseBody.create(null, new byte[0])).build();
        }).build();
    }
}
