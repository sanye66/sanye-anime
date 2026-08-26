package com.sanye.anime.sanye_core.web;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PageResultTest {

    @Test
    void ofComputesTotalPages() {
        PageResult<String> result = PageResult.of(List.of("a", "b"), 1, 20, 45);
        assertEquals(3, result.totalPages());
        assertEquals(45, result.total());
    }
}
