package com.sanye.admin.web.controller.monitor;

import com.sanye.admin.common.annotation.Log;
import com.sanye.admin.common.core.domain.AjaxResult;
import com.sanye.admin.common.enums.BusinessType;
import com.sanye.admin.web.service.XxlJobAdminService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/monitor/xxl-job")
public class XxlJobController {
    private final XxlJobAdminService service;
    public XxlJobController(XxlJobAdminService service) { this.service = service; }

    @GetMapping
    @PreAuthorize("@ss.hasPermi('monitor:job:list')")
    public AjaxResult status() { return AjaxResult.success(service.status()); }

    @GetMapping("/logs")
    @PreAuthorize("@ss.hasPermi('monitor:job:query')")
    public AjaxResult logs(@RequestParam(defaultValue = "1") int pageNum,
                           @RequestParam(defaultValue = "10") int pageSize,
                           @RequestParam(defaultValue = "-1") int status) {
        return AjaxResult.success(service.logs(pageNum, pageSize, status));
    }

    @PostMapping("/trigger")
    @PreAuthorize("@ss.hasPermi('monitor:job:changeStatus')")
    @Log(title = "XXL-JOB 索引重建", businessType = BusinessType.UPDATE,
            isSaveRequestData = false, isSaveResponseData = false)
    public AjaxResult run() {
        service.run();
        return AjaxResult.success("调度已提交，请刷新日志查看执行结果");
    }
}
