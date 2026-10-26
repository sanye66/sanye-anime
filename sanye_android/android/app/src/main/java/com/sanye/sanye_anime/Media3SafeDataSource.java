package com.sanye.sanye_anime;

import android.content.Context;
import android.net.Uri;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.FileDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@UnstableApi
final class Media3SafeDataSource implements DataSource {
    private final Context context;
    private final File subtitle;
    private final OkHttpDataSource.Factory network;
    private final List<TransferListener> listeners = new ArrayList<>();
    private DataSource delegate;

    static DataSource.Factory factory(Context context, File subtitle) {
        return factory(context, subtitle, Collections.emptyMap());
    }

    static DataSource.Factory factory(Context context, File subtitle, Map<String, String> headers) {
        Map<String, String> safe;
        try { safe = Media3PlaybackPolicy.requestHeaders(headers); }
        catch (IOException invalid) { throw new IllegalArgumentException("媒体请求头无效", invalid); }
        OkHttpDataSource.Factory network = new OkHttpDataSource.Factory(networkClient())
                .setUserAgent(safe.getOrDefault("User-Agent", "sanye_anime/Media3")).setDefaultRequestProperties(safe);
        Context application = context.getApplicationContext();
        return () -> new Media3SafeDataSource(application, subtitle, network);
    }

    static OkHttpClient networkClient() {
        return new OkHttpClient.Builder()
                .proxy(java.net.Proxy.NO_PROXY)
                .connectTimeout(12, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
                .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(true)
                .dns(host -> {
                    try {
                        String authority = host.contains(":") ? "[" + host + "]" : host;
                        return Arrays.asList(SubscriptionFetchPolicy.resolvePublic(
                                Media3PlaybackPolicy.networkUri("https://" + authority + "/"), InetAddress::getAllByName));
                    } catch (Exception invalid) {
                        UnknownHostException failure = new UnknownHostException("媒体域名不是可用的公网地址");
                        failure.initCause(invalid);
                        throw failure;
                    }
                })
                .addInterceptor(chain -> {
                    Request request = chain.request();
                    for (int redirects = 0; ; redirects++) {
                        Media3PlaybackPolicy.networkUri(request.url().toString());
                        if (request.header("Authorization") != null || request.header("Cookie") != null
                                || request.header("Proxy-Authorization") != null) throw new IOException("媒体请求不得携带凭据");
                        Response response = chain.proceed(request);
                        int code = response.code();
                        if (code != 301 && code != 302 && code != 303 && code != 307 && code != 308) return response;
                        String location = response.header("Location");
                        okhttp3.HttpUrl target = location == null ? null : request.url().resolve(location);
                        response.close();
                        if (target == null || redirects >= Media3PlaybackPolicy.MAX_REDIRECTS) throw new IOException("媒体重定向无效或超过限制");
                        Media3PlaybackPolicy.networkUri(target.toString());
                        request = request.newBuilder().url(target).build();
                    }
                }).build();
    }

    private Media3SafeDataSource(Context context, File subtitle, OkHttpDataSource.Factory network) {
        this.context = context;
        this.subtitle = subtitle;
        this.network = network;
    }

    @Override
    public void addTransferListener(TransferListener listener) {
        listeners.add(listener);
        if (delegate != null) delegate.addTransferListener(listener);
    }

    @Override
    public long open(DataSpec specification) throws IOException {
        if ("file".equals(specification.uri.getScheme())) {
            File candidate;
            try { candidate = new File(java.net.URI.create(specification.uri.toString())).getCanonicalFile(); }
            catch (IllegalArgumentException invalid) { throw new IOException("本地媒体地址无效", invalid); }
            if (subtitle == null || !candidate.equals(subtitle.getCanonicalFile())) {
                Media3PlaybackPolicy.completedFile(specification.uri.toString(), DownloadRuntime.get(context).store);
            }
            delegate = new FileDataSource();
        } else {
            Media3PlaybackPolicy.networkUri(specification.uri.toString());
            delegate = network.createDataSource();
        }
        for (TransferListener listener : listeners) delegate.addTransferListener(listener);
        return delegate.open(specification);
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        if (delegate == null) throw new IOException("媒体连接尚未打开");
        return delegate.read(buffer, offset, length);
    }

    @Override
    public Uri getUri() { return delegate == null ? null : delegate.getUri(); }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        return delegate == null ? Collections.emptyMap() : delegate.getResponseHeaders();
    }

    @Override
    public void close() throws IOException {
        if (delegate != null) { try { delegate.close(); } finally { delegate = null; } }
    }
}
