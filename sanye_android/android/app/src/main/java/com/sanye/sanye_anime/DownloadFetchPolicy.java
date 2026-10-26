package com.sanye.sanye_anime;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.*;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

final class DownloadFetchPolicy {
    static final long MAX_FILE_BYTES = 512L * 1024 * 1024;
    private static final ExecutorService DNS = new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS,
            new SynchronousQueue<>(), runnable -> {
        Thread thread = new Thread(runnable, "sanye-download-dns");
        thread.setDaemon(true);
        return thread;
    });
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "sanye-download-deadline");
        thread.setDaemon(true);
        return thread;
    });
    interface Transfer {
        void connected(Socket socket) throws IOException;
        void progress(long bytes, long total) throws IOException;
        void check(long incomingBytes) throws IOException;
        default void metadata(String etag, long total) throws IOException {}
        default void restart() throws IOException { throw new IOException("服务器要求重新下载"); }
    }
    static URI validate(String value) throws IOException {
        URI uri = SubscriptionFetchPolicy.validateUrl(value);
        String path = uri.getPath().toLowerCase(Locale.ROOT);
        if (!path.endsWith(".mp4")) throw new IOException("仅支持 HTTPS MP4 直链，暂不支持 HLS、DASH 或解析页");
        if (!uri.toASCIIString().equals(value)) throw new IOException("下载地址需要使用完整编码的 HTTPS 地址");
        return uri;
    }
    static long download(String value, OutputStream output, Transfer transfer) throws Exception {
        return download(value, output, transfer, 0, "", 0);
    }
    static boolean strongEtag(String value) {
        return value != null && value.matches("\"[!#-~]*\"");
    }
    static long download(String value, OutputStream output, Transfer transfer, long offset, String etag, long expectedTotal) throws Exception {
        if (offset < 0 || offset > 0 && (!strongEtag(etag) || offset >= expectedTotal)) throw new IOException("下载续传信息无效");
        URI uri = validate(value);
        Future<InetAddress[]> lookup = DNS.submit(() -> SubscriptionFetchPolicy.resolvePublic(uri, InetAddress::getAllByName));
        InetAddress[] addresses;
        try { addresses = lookup.get(8, TimeUnit.SECONDS); }
        finally { lookup.cancel(true); }
        transfer.check(0);
        try (Socket socket = new Socket()) {
            ScheduledFuture<?> deadline = DEADLINES.schedule(() -> {
                try { socket.close(); } catch (IOException ignored) {}
            }, 30, TimeUnit.MINUTES);
            try {
            transfer.connected(socket);
            socket.connect(new InetSocketAddress(addresses[0], 443), 8_000);
            socket.setSoTimeout(15_000);
            try (SSLSocket tls = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault())
                    .createSocket(socket, uri.getHost(), 443, true)) {
                SSLParameters parameters = tls.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                if (!uri.getHost().contains(":") && !uri.getHost().matches("[0-9.]+")) {
                    parameters.setServerNames(Collections.singletonList(new SNIHostName(uri.getHost())));
                }
                tls.setSSLParameters(parameters);
                tls.setSoTimeout(15_000);
                tls.startHandshake();
                String target = uri.getRawPath();
                if (uri.getRawQuery() != null) target += "?" + uri.getRawQuery();
                String request = "GET " + target + " HTTP/1.1\r\nHost: " + uri.getHost()
                        + "\r\nAccept: video/mp4\r\nAccept-Encoding: identity"
                        + (offset > 0 ? "\r\nRange: bytes=" + offset + "-\r\nIf-Range: " + etag : "")
                        + "\r\nConnection: close\r\n\r\n";
                tls.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
                return readResponse(tls.getInputStream(), output, transfer, offset, etag, expectedTotal);
            }
            } finally { deadline.cancel(false); }
        }
    }
    static long readResponse(InputStream input, OutputStream output, Transfer transfer) throws IOException {
        return readResponse(input, output, transfer, 0, "", 0);
    }
    static long readResponse(InputStream input, OutputStream output, Transfer transfer, long offset, String etag, long expectedTotal) throws IOException {
        int[] budget = {32 * 1024};
        String status = line(input, budget);
        boolean partial = status.matches("HTTP/1\\.[01] 206(?: .*)?");
        if (!status.matches("HTTP/1\\.[01] 200(?: .*)?") && !partial) {
            throw new IOException(status.matches("HTTP/1\\.[01] 3\\d\\d(?: .*)?")
                    ? "下载地址发生重定向，请使用最终 HTTPS MP4 直链" : "下载服务器未返回成功响应");
        }
        Map<String, String> headers = new HashMap<>();
        String row;
        while (!(row = line(input, budget)).isEmpty()) {
            int colon = row.indexOf(':');
            if (colon <= 0) throw new IOException("下载响应头无效");
            String key = row.substring(0, colon).toLowerCase(Locale.ROOT);
            if (headers.put(key, row.substring(colon + 1).trim()) != null) throw new IOException("下载响应头重复");
        }
        if (headers.containsKey("transfer-encoding")
                || !headers.getOrDefault("content-encoding", "identity").equalsIgnoreCase("identity")) {
            throw new IOException("暂不支持分块或压缩下载，请使用带文件大小的 MP4 直链");
        }
        if (!headers.getOrDefault("content-type", "").split(";", 2)[0].trim().equalsIgnoreCase("video/mp4")) {
            throw new IOException("服务器未返回 MP4 视频文件");
        }
        long length;
        String declaredLength = headers.getOrDefault("content-length", "");
        if (!declaredLength.matches("[0-9]+")) throw new IOException("下载服务器未提供有效文件大小");
        try { length = Long.parseLong(declaredLength); }
        catch (NumberFormatException invalid) { throw new IOException("下载服务器未提供有效文件大小"); }
        long total = length;
        String responseEtag = headers.getOrDefault("etag", "");
        if (partial) {
            if (offset <= 0 || !strongEtag(etag) || !etag.equals(responseEtag)) throw new IOException("下载续传文件版本不一致，请重新下载");
            Matcher range = Pattern.compile("bytes ([0-9]+)-([0-9]+)/([0-9]+)").matcher(headers.getOrDefault("content-range", ""));
            if (!range.matches()) throw new IOException("下载续传范围无效");
            try {
                long start = Long.parseLong(range.group(1)); long end = Long.parseLong(range.group(2));
                total = Long.parseLong(range.group(3));
                if (start != offset || total != expectedTotal || end != total - 1 || length != total - offset || length <= 0) throw new IOException("下载续传范围与本地文件不一致");
            } catch (NumberFormatException invalid) { throw new IOException("下载续传范围无效"); }
        } else {
            if (headers.containsKey("content-range")) throw new IOException("下载响应范围无效");
        }
        if (total < 16 || total > MAX_FILE_BYTES) throw new IOException("MP4 文件大小无效或超过 512 MiB 上限");
        if (!partial && offset > 0) { transfer.restart(); offset = 0; }
        transfer.check(total - offset);
        transfer.metadata(strongEtag(responseEtag) ? responseEtag : "", total);
        long copied = offset;
        if (!partial) {
            byte[] signature = new byte[12];
            int signatureBytes = 0;
            while (signatureBytes < signature.length) {
                transfer.check(0);
                int read = input.read(signature, signatureBytes, signature.length - signatureBytes);
                if (read < 0) throw new IOException("下载文件不完整");
                signatureBytes += read;
            }
            long boxSize = ((signature[0] & 255L) << 24) | ((signature[1] & 255L) << 16)
                    | ((signature[2] & 255L) << 8) | (signature[3] & 255L);
            if (boxSize < 16 || boxSize > total || signature[4] != 'f' || signature[5] != 't'
                    || signature[6] != 'y' || signature[7] != 'p') throw new IOException("文件不是受支持的 MP4 格式");
            output.write(signature);
            copied = signature.length;
        }
        transfer.progress(copied, total);
        byte[] buffer = new byte[64 * 1024];
        while (copied < total) {
            transfer.check(0);
            int count = input.read(buffer, 0, (int) Math.min(buffer.length, total - copied));
            if (count < 0) throw new IOException("下载文件不完整，请重试");
            if (count == 0) continue;
            transfer.check(count);
            output.write(buffer, 0, count);
            copied += count;
            transfer.progress(copied, total);
        }
        return copied;
    }
    private static String line(InputStream input, int[] budget) throws IOException {
        StringBuilder result = new StringBuilder();
        int value;
        while ((value = input.read()) != -1) {
            if (--budget[0] < 0) throw new IOException("下载响应头过大");
            if (value == '\n') {
                if (result.length() == 0 || result.charAt(result.length() - 1) != '\r') throw new IOException("下载响应头无效");
                return result.substring(0, result.length() - 1);
            }
            if (value > 127 || value < 32 && value != '\r' && value != '\t') throw new IOException("下载响应头无效");
            result.append((char) value);
        }
        throw new IOException("下载响应头不完整");
    }
}
