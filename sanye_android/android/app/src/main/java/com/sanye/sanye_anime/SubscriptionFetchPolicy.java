package com.sanye.sanye_anime;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.*;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** 仅下载公网 HTTPS 正文；固定已校验的 IP 建连，避免 DNS 重绑定与重定向越界。 */
final class SubscriptionFetchPolicy {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int TIMEOUT_MILLIS = 8_000;
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "sanye-subscription-deadline");
        thread.setDaemon(true);
        return thread;
    });
    private static final ExecutorService DNS = new ThreadPoolExecutor(0, 4, 30, TimeUnit.SECONDS,
            new SynchronousQueue<>(), runnable -> {
                Thread thread = new Thread(runnable, "sanye-subscription-dns");
                thread.setDaemon(true);
                return thread;
            });

    interface Resolver { InetAddress[] resolve(String host) throws Exception; }

    static URI validateUrl(String value) throws IOException {
        try {
            URI uri = URI.create(value == null ? "" : value.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawFragment() != null
                    || value.length() > 4096) throw new IllegalArgumentException();
            host = host.toLowerCase(Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
            if (!host.contains(".") && !host.contains(":") || host.equals("localhost")
                    || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
                    || host.endsWith(".lan") || host.endsWith(".home") || host.endsWith(".home.arpa")
                    || host.endsWith(".corp") || host.endsWith(".intranet") || host.endsWith(".test")
                    || host.endsWith(".invalid") || host.endsWith(".onion")
                    || host.matches(".*[\\\\%\\s].*")) throw new IllegalArgumentException();
            return uri;
        } catch (RuntimeException invalid) {
            throw new IOException("订阅地址必须是不含凭据的公网 HTTPS 地址（端口 443）");
        }
    }

    static InetAddress[] resolvePublic(URI uri, Resolver resolver) throws Exception {
        InetAddress[] addresses = resolver.resolve(uri.getHost());
        if (addresses == null || addresses.length == 0) throw new IOException("订阅域名无法解析");
        for (InetAddress address : addresses) {
            if (!isPublic(address)) throw new IOException("订阅地址不能访问本机、内网或保留地址");
        }
        return addresses;
    }

    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            int a = bytes[0] & 255, b = bytes[1] & 255, c = bytes[2] & 255;
            return !(a == 0 || a == 10 || a == 127 || a >= 224
                    || a == 100 && b >= 64 && b <= 127
                    || a == 169 && b == 254 || a == 172 && b >= 16 && b <= 31
                    || a == 192 && (b == 168 || b == 0 || b == 2 || b == 88 && c == 99)
                    || a == 198 && (b == 18 || b == 19 || b == 51 && c == 100)
                    || a == 203 && b == 0 && c == 113);
        }
        // 只允许全球单播 2000::/3；排除文档、协议分配、6to4 和特殊转换地址。
        int a = bytes[0] & 255, b = bytes[1] & 255;
        return bytes.length == 16 && (a & 0xe0) == 0x20
                && !(a == 0x20 && b == 0x01 && ((bytes[2] & 255) < 2
                    || (bytes[2] & 255) == 0x0d && (bytes[3] & 255) == 0xb8))
                && !(a == 0x20 && b == 0x02)
                && !(a == 0x3f && b == 0xff && (bytes[2] & 255) < 0x10);
    }

    static String fetch(String value) throws Exception {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException("订阅请求已取消");
        URI uri = validateUrl(value);
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT_MILLIS);
        Future<InetAddress[]> lookup = DNS.submit(() -> resolvePublic(uri, InetAddress::getAllByName));
        InetAddress[] addresses;
        try {
            addresses = lookup.get(remaining(deadline), TimeUnit.MILLISECONDS);
        } finally {
            lookup.cancel(true);
        }
        // 直接使用验证后的地址，不把域名再次交给连接层解析，也不使用系统 HTTP 代理。
        try (Socket socket = connectPublic(addresses, deadline, (address, timeout) -> {
            Socket candidate = new Socket();
            ScheduledFuture<?> cancellation = closeOnInterrupt(candidate, Thread.currentThread());
            try {
                candidate.connect(new InetSocketAddress(address, 443), timeout);
                return candidate;
            } catch (IOException failure) {
                candidate.close();
                throw failure;
            } finally {
                cancellation.cancel(false);
            }
        })) {
            ScheduledFuture<?> closeAtDeadline = DEADLINES.schedule(() -> {
                try { socket.close(); } catch (IOException ignored) { /* 已关闭 */ }
            }, remaining(deadline), TimeUnit.MILLISECONDS);
            ScheduledFuture<?> closeOnCancellation = closeOnInterrupt(socket, Thread.currentThread());
            try {
            socket.setSoTimeout(remaining(deadline));
            try (SSLSocket tls = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault())
                    .createSocket(socket, uri.getHost(), 443, true)) {
                SSLParameters parameters = tls.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                if (!uri.getHost().contains(":") && !uri.getHost().matches("[0-9.]+")) {
                    parameters.setServerNames(Collections.singletonList(new SNIHostName(uri.getHost())));
                }
                tls.setSSLParameters(parameters);
                tls.setSoTimeout(remaining(deadline));
                tls.startHandshake();
                String target = uri.getRawPath();
                if (target == null || target.isEmpty()) target = "/";
                if (uri.getRawQuery() != null) target += "?" + uri.getRawQuery();
                String request = "GET " + target + " HTTP/1.1\r\nHost: " + uri.getHost()
                        + "\r\nUser-Agent: sanye_anime/AndroidSource\r\nAccept: application/json,text/plain;q=0.9,*/*;q=0.8\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n";
                tls.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
                return readResponse(tls.getInputStream(), () -> tls.setSoTimeout(remaining(deadline)));
            }
            } finally {
                closeOnCancellation.cancel(false);
                closeAtDeadline.cancel(false);
            }
        }
    }

    interface SocketConnector { Socket connect(InetAddress address, int timeout) throws IOException; }

    static Socket connectPublic(InetAddress[] addresses, long deadline, SocketConnector connector) throws IOException {
        IOException last = null;
        for (int index = 0; index < addresses.length; index++) {
            int timeout = Math.max(1, remaining(deadline) / (addresses.length - index));
            try { return connector.connect(addresses[index], timeout); }
            catch (IOException failure) {
                if (Thread.currentThread().isInterrupted()) throw failure;
                last = failure;
            }
        }
        throw last == null ? new IOException("订阅域名无法连接") : last;
    }

    /** Socket 阻塞读不响应 Future.cancel；复用既有期限线程关闭底层连接，无需新增请求线程。 */
    static ScheduledFuture<?> closeOnInterrupt(Socket socket, Thread owner) {
        return DEADLINES.scheduleWithFixedDelay(() -> {
            if (owner.isInterrupted()) {
                try { socket.close(); } catch (IOException ignored) { /* 已关闭 */ }
            }
        }, 0, 25, TimeUnit.MILLISECONDS);
    }

    private static int remaining(long deadline) throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new IOException("订阅请求已取消");
        long millis = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
        if (millis <= 0) throw new IOException("读取订阅超时（8 秒）");
        return (int) Math.min(millis, TIMEOUT_MILLIS);
    }

    interface ReadDeadline { void check() throws IOException; }

    static String readResponse(InputStream input, ReadDeadline deadline) throws IOException {
        int[] headerBudget = {32 * 1024};
        String status = line(input, deadline, headerBudget);
        if (!status.matches("HTTP/1\\.[01] 200(?: .*)?")) {
            throw new IOException(status.matches("HTTP/1\\.[01] 3\\d\\d(?: .*)?")
                    ? "订阅地址发生重定向，请使用最终 HTTPS 地址" : "订阅服务器未返回成功响应");
        }
        Map<String, String> headers = new HashMap<>();
        String row;
        while (!(row = line(input, deadline, headerBudget)).isEmpty()) {
            int colon = row.indexOf(':');
            if (colon <= 0) throw new IOException("订阅响应头无效");
            String key = row.substring(0, colon).toLowerCase(Locale.ROOT);
            if (headers.put(key, row.substring(colon + 1).trim()) != null
                    && (key.equals("content-length") || key.equals("transfer-encoding"))) {
                throw new IOException("订阅响应头存在冲突");
            }
        }
        String encoding = headers.getOrDefault("content-encoding", "identity");
        if (!encoding.equalsIgnoreCase("identity")) throw new IOException("订阅服务器返回了不支持的压缩格式");
        String transfer = headers.get("transfer-encoding");
        String length = headers.get("content-length");
        if (transfer != null && (!transfer.equalsIgnoreCase("chunked") || length != null)) {
            throw new IOException("订阅响应传输格式无效");
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (transfer != null) {
            while (true) {
                String chunk = line(input, deadline, new int[]{1024});
                int extension = chunk.indexOf(';');
                if (extension >= 0) chunk = chunk.substring(0, extension);
                long size = number(chunk, 16);
                if (size == 0) {
                    while (!line(input, deadline, headerBudget).isEmpty()) { /* 忽略尾部元数据 */ }
                    break;
                }
                copy(input, output, size, deadline);
                if (!line(input, deadline, new int[]{2}).isEmpty()) throw new IOException("订阅分块格式无效");
            }
        } else if (length != null) {
            copy(input, output, number(length, 10), deadline);
        } else {
            copy(input, output, -1, deadline);
        }
        if (output.size() == 0) throw new IOException("订阅内容为空");
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString();
        } catch (Exception invalid) {
            throw new IOException("订阅内容不是有效的 UTF-8 JSON");
        }
    }

    private static long number(String value, int radix) throws IOException {
        try {
            if (!value.matches(radix == 16 ? "[0-9a-fA-F]+" : "[0-9]+")) throw new NumberFormatException();
            return Long.parseLong(value, radix);
        } catch (NumberFormatException invalid) { throw new IOException("订阅响应长度无效"); }
    }

    private static String line(InputStream input, ReadDeadline deadline, int[] budget) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while (true) {
            deadline.check();
            int next = input.read();
            if (next < 0 || --budget[0] < 0) throw new IOException("订阅响应头或分块无效");
            if (next == '\n') {
                byte[] bytes = output.toByteArray();
                if (bytes.length == 0 || bytes[bytes.length - 1] != '\r') throw new IOException("订阅响应行无效");
                return new String(bytes, 0, bytes.length - 1, StandardCharsets.US_ASCII);
            }
            output.write(next);
        }
    }

    private static void copy(InputStream input, ByteArrayOutputStream output, long length, ReadDeadline deadline)
            throws IOException {
        if (length > MAX_BYTES - output.size()) throw new IOException("订阅内容超过 2 MB");
        byte[] buffer = new byte[8192];
        long left = length;
        while (left != 0) {
            deadline.check();
            int count = input.read(buffer, 0, left < 0 ? buffer.length : (int) Math.min(left, buffer.length));
            if (count < 0) {
                if (left > 0) throw new IOException("订阅响应正文被截断");
                break;
            }
            if (count > MAX_BYTES - output.size()) throw new IOException("订阅内容超过 2 MB");
            output.write(buffer, 0, count);
            if (left > 0) left -= count;
        }
    }
}
