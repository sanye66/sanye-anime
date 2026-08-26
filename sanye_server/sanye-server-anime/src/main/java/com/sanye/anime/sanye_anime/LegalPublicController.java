package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.PublicLegalDocument;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 官网公开接口（T-D-07）：法律正文只读，网关公开白名单 /api/v1/public/** 匿名访问。
 */
@RestController
public class LegalPublicController {

    private final LegalDocumentService legalDocumentService;
    private final HttpServletRequest request;

    /** 注入正文服务和请求对象，公开接口只暴露已发布内容。 */
    public LegalPublicController(LegalDocumentService legalDocumentService, HttpServletRequest request) {
        this.legalDocumentService = legalDocumentService;
        this.request = request;
    }

    /** 仅返回已发布法律正文，供官网匿名页面使用。 */
    @GetMapping("/api/v1/public/legal")
    public ApiResponse<List<PublicLegalDocument>> legal() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        String requestId = rid == null ? "" : rid.toString();
        return ApiResponse.ok(legalDocumentService.listPublished(), requestId);
    }
}
