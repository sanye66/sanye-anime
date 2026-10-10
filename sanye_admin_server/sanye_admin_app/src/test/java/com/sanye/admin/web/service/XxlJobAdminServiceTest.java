package com.sanye.admin.web.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.admin.common.exception.ServiceException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class XxlJobAdminServiceTest {
    private HttpServer server;
    private XxlJobAdminService service;
    private final Map<String, String> bodies = new HashMap<>();
    private final Map<String, String> requests = new HashMap<>();
    private final AtomicInteger triggers = new AtomicInteger();
    private String failurePath = "";
    private int failureCode = 302;
    private String failureType = "text/html";

    @BeforeEach
    void setup() throws Exception {
        bodies.put("/login", "{\"code\":200}");
        bodies.put("/jobgroup/pageList", "{\"data\":[{\"id\":2,\"appname\":\"sanye_job\",\"registryList\":[\"http://private:9999\"]}]}");
        bodies.put("/jobinfo/pageList", "{\"data\":[{\"id\":3,\"jobGroup\":2,\"glueType\":\"BEAN\",\"executorHandler\":\"rebuildAnimeIndex\",\"executorBlockStrategy\":\"DISCARD_LATER\",\"executorFailRetryCount\":0,\"executorParam\":\"\"}]}");
        bodies.put("/jobinfo/trigger", "{\"code\":200}");
        bodies.put("/joblog/pageList", "{\"recordsFiltered\":11,\"data\":[{\"id\":9,\"jobId\":3,\"jobGroup\":2,\"triggerTime\":\"2026-09-09 12:00:00\",\"triggerCode\":200,\"handleCode\":500,\"triggerMsg\":\"<b>http://private secret</b>\",\"handleMsg\":\"password=secret\"}]}");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.put(path, new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            if (path.equals("/jobinfo/trigger")) triggers.incrementAndGet();
            String response = bodies.getOrDefault(path, "{}");
            int code = 200;
            if (!path.equals("/login") && !"SESSION=test".equals(exchange.getRequestHeaders().getFirst("Cookie"))) code = 401;
            exchange.getResponseHeaders().set("Content-Type", "application/json;charset=UTF-8");
            if (path.equals("/login")) exchange.getResponseHeaders().set("Set-Cookie", "SESSION=test; Path=/; HttpOnly");
            if (failurePath.equals(path)) {
                code = failureCode;
                exchange.getResponseHeaders().set("Content-Type", failureType);
                exchange.getResponseHeaders().set("Location", "/login");
                response = "<html>private secret</html>";
            }
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(code, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        service = new XxlJobAdminService(new ObjectMapper(), "http://127.0.0.1:" + server.getAddress().getPort(),
                "test-user", "test-password", 3, "sanye_job");
    }

    @AfterEach void stop() { server.stop(0); }

    @Test void disabledWithoutCredentialsDoesNotCallPlatform() {
        var disabled = new XxlJobAdminService(new ObjectMapper(), "", "", "", 0, "");
        assertFalse(disabled.status().configured());
        assertThrows(ServiceException.class, disabled::run);
        assertTrue(requests.isEmpty());
    }

    @Test void validatesTaskAndSubmitsOnlyConfiguredId() {
        assertTrue(service.status().executorOnline());
        service.run();
        assertEquals(1, triggers.get());
        assertTrue(requests.get("/login").contains("userName=test-user"));
        assertTrue(requests.get("/jobgroup/pageList").contains("title="));
        assertTrue(requests.get("/jobinfo/trigger").contains("id=3"));
        assertTrue(requests.get("/jobinfo/trigger").contains("executorParam="));
        assertTrue(requests.get("/jobinfo/trigger").contains("addressList="));
    }

    @Test void logsArePagedAndMessagesAreSanitized() throws Exception {
        var page = service.logs(2, 10, -1);
        assertEquals(11, page.total());
        assertEquals("FAILED", page.rows().getFirst().status());
        String json = new ObjectMapper().writeValueAsString(page);
        assertFalse(json.contains("private"));
        assertFalse(json.contains("secret"));
        assertFalse(json.contains("<b>"));
        assertTrue(requests.get("/joblog/pageList").contains("start=10"));
        assertTrue(requests.get("/joblog/pageList").contains("jobId=3"));
        assertTrue(requests.get("/joblog/pageList").contains("logStatus=-1"));
    }

    @Test void logStatesSeparateSubmissionFromExecution() {
        for (String[] entry : new String[][]{{"0","0","PENDING"},{"200","0","RUNNING"},{"200","200","SUCCESS"},{"500","0","FAILED"}}) {
            bodies.put("/joblog/pageList", "{\"recordsFiltered\":1,\"data\":[{\"jobId\":3,\"jobGroup\":2,\"triggerCode\":" + entry[0] + ",\"handleCode\":" + entry[1] + "}]}");
            assertEquals(entry[2], service.logs(1, 10, -1).rows().getFirst().status());
        }
    }

    @Test void rejectsInvalidPaginationBeforeLogin() {
        assertThrows(ServiceException.class, () -> service.logs(0, 10, -1));
        assertThrows(ServiceException.class, () -> service.logs(1, 101, -1));
        assertThrows(ServiceException.class, () -> service.logs(1, 10, 9));
        assertTrue(requests.isEmpty());
    }

    @Test void refusesForeignTaskAndForeignLog() {
        bodies.put("/jobinfo/pageList", bodies.get("/jobinfo/pageList").replace("\"jobGroup\":2", "\"jobGroup\":8"));
        assertThrows(ServiceException.class, service::run);
        assertEquals(0, triggers.get());
    }

    @Test void refusesUnexpectedLogJob() {
        bodies.put("/joblog/pageList", bodies.get("/joblog/pageList").replace("\"jobId\":3", "\"jobId\":4"));
        assertThrows(ServiceException.class, () -> service.logs(1, 10, -1));
    }

    @Test void refusesWrongHandlerAndUnsafeRetryPolicy() {
        String original = bodies.get("/jobinfo/pageList");
        for (String invalid : new String[]{original.replace("rebuildAnimeIndex", "otherJob"),
                original.replace("BEAN", "GLUE_SHELL"), original.replace("DISCARD_LATER", "SERIAL_EXECUTION"),
                original.replace("\"executorFailRetryCount\":0", "\"executorFailRetryCount\":1")}) {
            bodies.put("/jobinfo/pageList", invalid);
            assertThrows(ServiceException.class, service::run);
        }
        assertEquals(0, triggers.get());
    }

    @Test void loginFailureDoesNotExposePlatformMessage() {
        bodies.put("/login", "{\"code\":500,\"msg\":\"private secret\"}");
        ServiceException error = assertThrows(ServiceException.class, service::run);
        assertFalse(error.getMessage().contains("secret"));
        assertEquals(0, triggers.get());
    }

    @Test void rejectsRedirectUnauthorizedAndHtmlWithoutFollowingLogin() {
        failurePath = "/jobinfo/pageList";
        for (int code : new int[]{302, 401, 200}) {
            failureCode = code;
            assertThrows(ServiceException.class, service::run);
        }
        assertEquals(0, triggers.get());
    }

    @Test void triggerFailureIsNotRetriedAndReportsUncertainSubmission() {
        failurePath = "/jobinfo/trigger";
        failureCode = 500;
        assertTrue(assertThrows(ServiceException.class, service::run).getMessage().contains("先刷新日志"));
        assertEquals(1, triggers.get());
    }

    @Test void emptyRegistryRefusesTrigger() {
        bodies.put("/jobgroup/pageList", "{\"data\":[{\"id\":2,\"appname\":\"sanye_job\",\"registryList\":[]}]}");
        assertFalse(service.status().executorOnline());
        assertThrows(ServiceException.class, service::run);
        assertEquals(0, triggers.get());
    }
}
