package com.sanye.admin.config;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.Level;
import ch.qos.logback.core.read.ListAppender;
import ch.qos.logback.classic.spi.ILoggingEvent;
import com.sanye.admin.common.utils.http.HttpUtils;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import static org.junit.jupiter.api.Assertions.*;

class HttpUtilsSecretLoggingTest {
    @Test void untrustedHttpsPeerDoesNotReceiveCredentials() throws Exception {
        var directory = java.nio.file.Files.createTempDirectory("sanye-tr05-tls-");
        var keystoreFile = directory.resolve("fixture.p12");
        String password = UUID.randomUUID().toString();
        com.sun.net.httpserver.HttpsServer server = null;
        try {
            String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
            var builder = new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"), "bin", executable).toString(),
                    "-genkeypair", "-alias", "fixture", "-keyalg", "RSA", "-keysize", "2048",
                    "-dname", "CN=localhost", "-ext", "SAN=ip:127.0.0.1", "-validity", "1", "-storetype", "PKCS12",
                    "-keystore", keystoreFile.toString(), "-storepass:env", "SANYE_TEST_KEYSTORE_PASSWORD",
                    "-keypass:env", "SANYE_TEST_KEYSTORE_PASSWORD", "-noprompt");
            builder.environment().put("SANYE_TEST_KEYSTORE_PASSWORD", password);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD);
            var process = builder.start();
            boolean finished = process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS);
            if (!finished) { process.destroyForcibly(); process.waitFor(); }
            assertTrue(finished);
            assertEquals(0, process.exitValue());
            var store = java.security.KeyStore.getInstance("PKCS12");
            try (var input = java.nio.file.Files.newInputStream(keystoreFile)) { store.load(input, password.toCharArray()); }
            var keys = javax.net.ssl.KeyManagerFactory.getInstance(javax.net.ssl.KeyManagerFactory.getDefaultAlgorithm());
            keys.init(store, password.toCharArray());
            var tls = javax.net.ssl.SSLContext.getInstance("TLS");
            tls.init(keys.getKeyManagers(), null, null);
            server = com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setHttpsConfigurator(new com.sun.net.httpserver.HttpsConfigurator(tls));
            var received = new java.util.concurrent.atomic.AtomicBoolean();
            server.createContext("/", exchange -> {
                received.set(true);
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            });
            server.start();
            assertEquals("", HttpUtils.sendSSLPost("https://127.0.0.1:" + server.getAddress().getPort() + "/", "password=" + password));
            assertFalse(received.get());
        } finally {
            if (server != null) server.stop(0);
            java.nio.file.Files.deleteIfExists(keystoreFile);
            java.nio.file.Files.deleteIfExists(directory);
        }
    }

    @Test void successAndFailureNeverLogUrlParametersBodiesOrExceptionMessages() throws Exception {
        String secret = UUID.randomUUID().toString();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        Logger logger = (Logger) LoggerFactory.getLogger(HttpUtils.class);
        Level previous = logger.getLevel();
        ListAppender<ILoggingEvent> captured = new ListAppender<>();
        captured.start();
        logger.addAppender(captured);
        logger.setLevel(Level.DEBUG);
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/";
            assertEquals(secret, HttpUtils.sendGet(url, "token=" + secret));
            assertEquals(secret, HttpUtils.sendPost(url + "?token=" + secret, "password=" + secret));
            HttpUtils.sendGet("invalid:" + secret, "token=" + secret);
            HttpUtils.sendPost("invalid:" + secret, "password=" + secret);
            HttpUtils.sendSSLPost("invalid:" + secret, "token=" + secret);
            assertFalse(captured.list.isEmpty());
            for (ILoggingEvent event : captured.list) {
                assertFalse(event.getFormattedMessage().contains(secret));
                assertNull(event.getThrowableProxy());
            }
        } finally {
            server.stop(0);
            logger.detachAppender(captured);
            logger.setLevel(previous);
            captured.stop();
        }
    }
}
