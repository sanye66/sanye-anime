package com.sanye.anime.sanye_job.client;

import com.sanye.anime.sanye_core.web.ApiResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import java.util.Map;

@FeignClient(name = "sanye-server-search", contextId = "jobSearchClient",
        url = "${SANYE_SEARCH_SERVICE_URL:http://localhost:8083}")
public interface SearchClient {
    @PostMapping("/api/v1/search/reindex")
    ApiResponse<Map<String, Integer>> reindex();
}
