package com.sanye.anime.sanye_search;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import com.sanye.anime.sanye_search.model.ExternalSearchHitView;
import java.util.List;
import java.util.Map;

/** 网页端订阅读取代理；复用现有安全链与统一响应。 */
@RestController
public class SubscriptionController {
    private final SubscriptionFetchService service;
    private final HttpServletRequest request;
    private final SubscriptionPlaybackService playback;

    public SubscriptionController(SubscriptionFetchService service, HttpServletRequest request) {
        this(service, request, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SubscriptionController(SubscriptionFetchService service, HttpServletRequest request, SubscriptionPlaybackService playback) {
        this.service = service;
        this.request = request;
        this.playback = playback;
    }

    @GetMapping("/api/v1/search/subscription")
    public ApiResponse<Map<String, String>> fetch(@RequestParam String url) {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return ApiResponse.ok(Map.of("content", service.fetch(url)), rid == null ? "" : rid.toString());
    }

    public record SearchRequest(String content, String keyword, Integer size, Integer sourceIndex) {}
    public record PreviewRequest(String content, String sourceUrl, String title, Integer sourceIndex) {}
    public record ResolveRequest(String content, String sourceUrl, Integer sourceIndex) {}

    @PostMapping("/api/v1/search/subscription/search")
    public ApiResponse<List<ExternalSearchHitView>> search(@RequestBody SearchRequest body) {
        return ApiResponse.ok(playback.search(body.content(), body.keyword(), body.size(), body.sourceIndex()), requestId());
    }
    @PostMapping("/api/v1/search/subscription/preview")
    public ApiResponse<SubscriptionPlaybackService.Preview> preview(@RequestBody PreviewRequest body) {
        return ApiResponse.ok(playback.preview(body.content(), body.sourceUrl(), body.title(), body.sourceIndex()), requestId());
    }
    @PostMapping("/api/v1/search/subscription/resolve")
    public ApiResponse<SubscriptionPlaybackService.Playback> resolve(@RequestBody ResolveRequest body) {
        return ApiResponse.ok(playback.resolve(body.content(), body.sourceUrl(), body.sourceIndex()), requestId());
    }
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
