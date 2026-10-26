package com.sanye.sanye_anime;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class DownloadFetchPolicyTest {
    private byte[] mp4() {
        byte[] data = new byte[65536];
        data[3] = 24; data[4] = 'f'; data[5] = 't'; data[6] = 'y'; data[7] = 'p';
        data[8] = 'i'; data[9] = 's'; data[10] = 'o'; data[11] = 'm';
        return data;
    }
    private InputStream response(String headers, byte[] body) throws IOException {
        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        stream.write(headers.getBytes(StandardCharsets.US_ASCII)); stream.write(body);
        return new ByteArrayInputStream(stream.toByteArray());
    }
    private DownloadFetchPolicy.Transfer transfer(List<Long> progress) {
        return new DownloadFetchPolicy.Transfer() {
            public void connected(Socket socket) {}
            public void check(long bytes) {}
            public void progress(long bytes, long total) { progress.add(bytes); }
        };
    }
    @Test public void writesActualBytesAndReportsRealProgress() throws Exception {
        byte[] media = mp4();
        List<Long> progress = new ArrayList<>();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        long bytes = DownloadFetchPolicy.readResponse(response("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: "
                + media.length + "\r\n\r\n", media), output, transfer(progress));
        assertEquals(media.length, bytes); assertArrayEquals(media, output.toByteArray());
        assertEquals(Long.valueOf(12), progress.get(0));
        assertEquals(Long.valueOf(media.length), progress.get(progress.size() - 1));
    }
    @Test public void rejectsRedirectsUnknownLengthsOversizeCompressionHlsAndTruncatedFiles() throws Exception {
        byte[] media = mp4();
        String[] headers = {
            "HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1/private.mp4\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 536870913\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Encoding: gzip\r\nContent-Length: 65536\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nTransfer-Encoding: chunked\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: 65536\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 65537\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 65536\r\nContent-Length: 65536\r\n\r\n"
        };
        for (String header : headers) assertThrows(IOException.class, () -> DownloadFetchPolicy.readResponse(
                response(header, media), new ByteArrayOutputStream(), transfer(new ArrayList<>())));
        assertThrows(IOException.class, () -> DownloadFetchPolicy.readResponse(response(
                "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 65536\r\n\r\n", new byte[65536]),
                new ByteArrayOutputStream(), transfer(new ArrayList<>())));
    }
    @Test public void cancellationStopsFileWrites() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        DownloadFetchPolicy.Transfer cancelled = new DownloadFetchPolicy.Transfer() {
            private boolean done;
            public void connected(Socket socket) {}
            public void check(long bytes) throws IOException { if (done) throw new IOException("下载已取消"); }
            public void progress(long bytes, long total) { done = true; }
        };
        assertThrows(IOException.class, () -> DownloadFetchPolicy.readResponse(response(
                "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 65536\r\n\r\n", mp4()), output, cancelled));
        assertEquals(12, output.size());
    }
    @Test public void exactRangeAndStrongVersionAreRequiredBeforeAppending() throws Exception {
        String valid = "HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nContent-Length: 32\r\nETag: \"one\"\r\nContent-Range: bytes 32-63/64\r\n\r\n";
        ByteArrayOutputStream output = new ByteArrayOutputStream(); List<Long> progress = new ArrayList<>();
        assertEquals(64, DownloadFetchPolicy.readResponse(response(valid, new byte[32]), output, transfer(progress), 32, "\"one\"", 64));
        assertEquals(32, output.size()); assertEquals(Long.valueOf(64), progress.get(progress.size() - 1));
        for (String invalid : new String[]{valid.replace("32-63/64", "31-63/64"), valid.replace("32-63/64", "32-62/64"),
                valid.replace("32-63/64", "32-63/65"), valid.replace("ETag: \"one\"", "ETag: \"two\""),
                valid.replace("ETag: \"one\"", "ETag: W/\"one\""), valid.replace("Content-Length: 32", "Content-Length: 31"),
                valid.replace("32-63/64", "32-999999999999999999999/64")}) {
            ByteArrayOutputStream rejected = new ByteArrayOutputStream();
            assertThrows(IOException.class, () -> DownloadFetchPolicy.readResponse(response(invalid, new byte[32]), rejected, transfer(new ArrayList<>()), 32, "\"one\"", 64));
            assertEquals(0, rejected.size());
        }
        assertThrows(IOException.class, () -> DownloadFetchPolicy.readResponse(response(valid, new byte[32]), new ByteArrayOutputStream(), transfer(new ArrayList<>())));
        assertTrue(DownloadFetchPolicy.strongEtag("\"one\"")); assertFalse(DownloadFetchPolicy.strongEtag("W/\"one\""));
        assertFalse(DownloadFetchPolicy.strongEtag("\"one\"\r\nRange: bytes=0-"));
    }
    @Test public void rangeAnsweredWith200RestartsInsteadOfConcatenating() throws Exception {
        byte[] media = mp4(); ByteArrayOutputStream output = new ByteArrayOutputStream(); output.write(new byte[32]);
        DownloadFetchPolicy.Transfer restarted = new DownloadFetchPolicy.Transfer() {
            public void connected(Socket socket) {}
            public void check(long bytes) {}
            public void progress(long bytes, long total) {}
            public void restart() { output.reset(); }
            public void metadata(String etag, long total) { assertEquals("\"two\"", etag); assertEquals(media.length, total); }
        };
        DownloadFetchPolicy.readResponse(response("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 65536\r\nETag: \"two\"\r\n\r\n", media), output, restarted, 32, "\"one\"", 65536);
        assertArrayEquals(media, output.toByteArray());
    }
    @Test public void permitsOnlyExplicitHttpsMp4WithoutCredentialsOrFragments() throws Exception {
        assertEquals("cdn.sanye.org", DownloadFetchPolicy.validate("https://cdn.sanye.org/episode.mp4?token=abc").getHost());
        for (String url : new String[]{"http://cdn.sanye.org/a.mp4", "https://cdn.sanye.org/a.m3u8", "https://cdn.sanye.org/a.mpd",
                "https://user:secret@cdn.sanye.org/a.mp4", "https://cdn.sanye.org:8443/a.mp4", "https://localhost/a.mp4",
                "https://cdn.sanye.org/a.mp4#hash", "https://cdn.sanye.org/watch/1"}) {
            assertThrows(url, IOException.class, () -> DownloadFetchPolicy.validate(url));
        }
    }
}
