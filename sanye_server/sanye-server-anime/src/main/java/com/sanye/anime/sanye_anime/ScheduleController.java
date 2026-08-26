package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 一周排期接口（T-D-05），网关已将 /api/v1/schedule/** 路由到 anime 服务。
 */
@RestController
public class ScheduleController {

    private final HttpServletRequest request;
    private final WeeklyScheduleService weeklyScheduleService;

    /** 注入排期服务和请求对象，保持周排期响应可追踪。 */
    public ScheduleController(HttpServletRequest request, WeeklyScheduleService weeklyScheduleService) {
        this.request = request;
        this.weeklyScheduleService = weeklyScheduleService;
    }

    /** 返回按周分组的排期，并附带统一请求编号。 */
    @GetMapping("/api/v1/schedule/week")
    public ApiResponse<WeeklyScheduleService.WeeklySchedule> week() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        String requestId = rid == null ? "" : rid.toString();
        return ApiResponse.ok(weeklyScheduleService.week(), requestId);
    }
}
