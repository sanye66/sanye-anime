package com.sanye.anime.sanye_core.web;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestErrorController {

    @GetMapping("/test/business")
    public void business() {
        throw new BusinessException(ErrorCode.BAD_STATE);
    }

    @GetMapping("/test/unknown")
    public void unknown() {
        throw new IllegalStateException("boom");
    }
}
