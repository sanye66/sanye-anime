package com.sanye.sanye_anime;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.*;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

final class CoverFetchPolicy {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int MAX_REDIRECTS = 3;
    private static final ExecutorService DNS = new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS,
            new SynchronousQueue<>(), runnable -> {
                Thread thread = new Thread(runnable, "sanye-cover-dns");
                thread.setDaemon(true);
                return thread;
            });
    record Image(byte[] bytes, String mime) {}
    private static final OkHttpClient CLIENT = client(InetAddress::getAllByName);

    static URI validateUrl(String value) throws IOException {
        URI uri = SubscriptionFetchPolicy.validateUrl(value);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!host.matches("[a-z0-9.-]+") || host.matches("[0-9.]+")
                || host.matches(".*(?:^|\\.)(?:localdomain|example|arpa)$")) {
            throw new IOException("封面地址必须使用公网 HTTPS 域名");
        }
        return uri;
    }

    static OkHttpClient client() {
        return CLIENT;
    }

    static OkHttpClient client(SubscriptionFetchPolicy.Resolver resolver) {
        return new OkHttpClient.Builder().proxy(Proxy.NO_PROXY)
                .callTimeout(8, TimeUnit.SECONDS).connectTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
                .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
                .dns(host -> {
                    Future<InetAddress[]> lookup = null;
                    try {
                        URI uri = validateUrl("https://" + host + "/");
                        lookup = DNS.submit(() -> SubscriptionFetchPolicy.resolvePublic(uri, resolver));
                        return Arrays.asList(lookup.get(2, TimeUnit.SECONDS));
                    } catch (Exception invalid) {
                        UnknownHostException failure = new UnknownHostException("封面域名不是可用的公网地址");
                        failure.initCause(invalid);
                        throw failure;
                    } finally { if (lookup != null) lookup.cancel(true); }
                })
                .addInterceptor(chain -> {
                    Request request = chain.request();
                    for (int redirects = 0; ; redirects++) {
                        validateUrl(request.url().toString());
                        Response response = chain.proceed(request);
                        int status = response.code();
                        if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308) return response;
                        String location = response.header("Location");
                        okhttp3.HttpUrl next = location == null ? null : request.url().resolve(location);
                        response.close();
                        if (next == null || redirects >= MAX_REDIRECTS) throw new IOException("封面重定向无效或超过限制");
                        validateUrl(next.toString());
                        request = request.newBuilder().url(next).build();
                    }
                }).build();
    }

    static Image fetch(String value, Set<Call> active, long epoch, java.util.function.LongSupplier generation) throws Exception {
        URI uri = validateUrl(value);
        OkHttpClient client = client();
        Call call = client.newCall(new Request.Builder().url(uri.toString())
                .header("Accept", "image/png,image/jpeg,image/webp,image/avif,image/gif")
                .header("Accept-Encoding", "identity").header("User-Agent", "sanye_anime/Cover").build());
        active.add(call);
        try {
            if (generation.getAsLong() != epoch) throw new IOException("封面请求已取消");
            try (Response response = call.execute()) {
                if (!response.isSuccessful() || response.body() == null) throw new IOException("封面下载失败");
                String mime = response.header("Content-Type", "").split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
                return readImage(response.body().byteStream(), mime, response.body().contentLength());
            }
        } finally {
            active.remove(call);
        }
    }

    static Image readImage(InputStream input, String mime, long declaredSize) throws IOException {
        if (!Set.of("image/png", "image/jpeg", "image/webp", "image/avif", "image/gif").contains(mime)
                || declaredSize > MAX_BYTES) throw new IOException("封面格式或大小无效");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int count; (count = input.read(buffer)) != -1;) {
            if (count > MAX_BYTES - output.size()) throw new IOException("封面超过 2 MiB");
            output.write(buffer, 0, count);
        }
        byte[] bytes = output.toByteArray();
        if (bytes.length == 0 || declaredSize >= 0 && declaredSize != bytes.length || !validMagic(bytes, mime)) {
            throw new IOException("封面内容与图片格式不符");
        }
        return new Image(bytes, mime);
    }

    static boolean validMagic(byte[] bytes, String mime) {
        if (bytes.length < 12) return false;
        return switch (mime) {
            case "image/png" -> Arrays.equals(Arrays.copyOf(bytes, 8), new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10});
            case "image/jpeg" -> (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            case "image/gif" -> ascii(bytes, 0, 6).equals("GIF87a") || ascii(bytes, 0, 6).equals("GIF89a");
            case "image/webp" -> ascii(bytes, 0, 4).equals("RIFF") && ascii(bytes, 8, 12).equals("WEBP");
            case "image/avif" -> validAvif(bytes);
            default -> false;
        };
    }

    private static boolean validAvif(byte[] bytes) {
        if (bytes.length < 16 || !ascii(bytes, 4, 8).equals("ftyp")) return false;
        long size = java.nio.ByteBuffer.wrap(bytes, 0, 4).getInt() & 0xffffffffL;
        if (size < 16 || size > bytes.length || size % 4 != 0) return false;
        for (int offset = 8; offset + 4 <= size; offset += 4) {
            if (offset == 12) continue;
            String brand = ascii(bytes, offset, offset + 4);
            if (brand.equals("avif") || brand.equals("avis")) return true;
        }
        return false;
    }

    private static String ascii(byte[] bytes, int start, int end) {
        return new String(bytes, start, end - start, StandardCharsets.US_ASCII);
    }
}
