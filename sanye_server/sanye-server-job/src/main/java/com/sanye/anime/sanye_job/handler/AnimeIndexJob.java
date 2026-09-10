package com.sanye.anime.sanye_job.handler;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_job.client.SearchClient;
import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.handler.annotation.XxlJob;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class AnimeIndexJob {
    private final SearchClient searchClient;

    public AnimeIndexJob(SearchClient searchClient) {
        this.searchClient = searchClient;
    }

    @XxlJob("rebuildAnimeIndex")
    public void rebuildAnimeIndex() {
        try {
            ApiResponse<Map<String, Integer>> result = searchClient.reindex();
            if (result == null || result.code() != 0 || result.data() == null
                    || result.data().get("indexed") == null || result.data().get("indexed") < 0) {
                XxlJobHelper.handleFail("Anime index rebuild returned an invalid result");
                return;
            }
            XxlJobHelper.log("Anime index rebuilt; indexed=" + result.data().get("indexed"));
            XxlJobHelper.handleSuccess("Anime index rebuilt; indexed=" + result.data().get("indexed"));
        } catch (RuntimeException exception) {
            // Remote exceptions can contain request credentials or response bodies.
            XxlJobHelper.handleFail("Anime index rebuild failed; inspect search service logs");
        }
    }
}
