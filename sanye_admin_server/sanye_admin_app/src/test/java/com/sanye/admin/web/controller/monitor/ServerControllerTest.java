package com.sanye.admin.web.controller.monitor;

import com.sanye.admin.common.exception.ServiceException;
import com.sanye.admin.framework.web.domain.Server;
import org.junit.jupiter.api.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

class ServerControllerTest {
    static class Fixture extends ServerController {
        long now;
        Server next = new Server();
        boolean fail;
        @Override protected long nanoTime() { return now; }
        @Override protected Server collect() throws Exception {
            if (fail) throw new Exception("sampling failed");
            return next;
        }
    }

    @Test
    void missingSampleReturnsUnavailableWithoutSamplingOnRequest() {
        Fixture controller = new Fixture();
        assertThrows(ServiceException.class, controller::getInfo);
        controller.refreshSnapshot();
        assertSame(controller.next, controller.getInfo().get("data"));
    }

    @Test
    void failuresRetainOnlyBoundedLastSuccessfulSampleAndRecover() {
        Fixture controller = new Fixture();
        controller.refreshSnapshot();
        Server first = controller.next;
        controller.fail = true;
        controller.now = TimeUnit.SECONDS.toNanos(29);
        controller.refreshSnapshot();
        assertSame(first, controller.getInfo().get("data"));
        controller.now = TimeUnit.SECONDS.toNanos(30);
        assertThrows(ServiceException.class, controller::getInfo);
        controller.fail = false;
        controller.next = new Server();
        controller.refreshSnapshot();
        assertSame(controller.next, controller.getInfo().get("data"));
    }

    @Test
    void requestsDoNotWaitForInProgressSampling() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Fixture controller = new Fixture() {
            int calls;
            @Override protected Server collect() throws Exception {
                if (++calls > 1) {
                    entered.countDown();
                    if (!release.await(5, TimeUnit.SECONDS)) throw new Exception("test timeout");
                }
                return super.collect();
            }
        };
        controller.refreshSnapshot();
        Server first = controller.next;
        controller.next = new Server();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var refresh = pool.submit(controller::refreshSnapshot);
            try {
                assertTrue(entered.await(2, TimeUnit.SECONDS));
                assertSame(first, pool.submit(() -> controller.getInfo().get("data")).get(1, TimeUnit.SECONDS));
            } finally { release.countDown(); }
            refresh.get(2, TimeUnit.SECONDS);
            assertSame(controller.next, controller.getInfo().get("data"));
        }
    }
}
