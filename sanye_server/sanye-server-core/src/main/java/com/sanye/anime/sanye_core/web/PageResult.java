package com.sanye.anime.sanye_core.web;

import java.util.List;

/**
 * 分页结构，与 docs/api-contract.md 一致：items/page/size/total/totalPages。
 */
public record PageResult<T>(List<T> items, int page, int size, long total, int totalPages) {

    /** 根据总条数计算总页数，非法或零页大小统一返回零页。 */
    public static <T> PageResult<T> of(List<T> items, int page, int size, long total) {
        int pages = size <= 0 ? 0 : (int) Math.ceil((double) total / size);
        return new PageResult<>(items, page, size, total, pages);
    }
}
