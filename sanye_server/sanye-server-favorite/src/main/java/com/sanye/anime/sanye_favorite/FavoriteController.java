package com.sanye.anime.sanye_favorite;

import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import com.sanye.anime.sanye_favorite.model.FavoriteItem;
import com.sanye.anime.sanye_favorite.model.HistoryItem;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 收藏与历史接口（T-F-02），路由与前端 favorite.ts 对齐。
 */
@RestController
@RequestMapping("/api/v1/users/me")
public class FavoriteController {

    private final FavoriteService favoriteService;
    private final HttpServletRequest request;

    /** 注入收藏服务和请求对象，所有读写接口复用归属键与请求编号。 */
    public FavoriteController(FavoriteService favoriteService, HttpServletRequest request) {
        this.favoriteService = favoriteService;
        this.request = request;
    }

    /** 查询当前归属人的收藏分页。 */
    @GetMapping("/favorites")
    public ApiResponse<PageResult<FavoriteItem>> favorites(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(favoriteService.list(ownerKey(), page, size), requestId());
    }

    /** 查询当前归属人是否收藏指定作品。 */
    @GetMapping("/favorites/{animeId}/status")
    public ApiResponse<Map<String, Boolean>> favoriteStatus(@PathVariable long animeId) {
        return ApiResponse.ok(Map.of("favorite", favoriteService.isFavorite(ownerKey(), animeId)), requestId());
    }

    /** 添加收藏，重复添加由数据库唯一约束幂等处理。 */
    @PostMapping("/favorites/{animeId}")
    public ApiResponse<Void> addFavorite(@PathVariable long animeId) {
        favoriteService.add(ownerKey(), animeId);
        return ApiResponse.ok(null, requestId());
    }

    /** 删除当前归属人的收藏。 */
    @DeleteMapping("/favorites/{animeId}")
    public ApiResponse<Void> removeFavorite(@PathVariable long animeId) {
        favoriteService.remove(ownerKey(), animeId);
        return ApiResponse.ok(null, requestId());
    }

    /** 查询当前归属人的观看历史分页。 */
    @GetMapping("/history")
    public ApiResponse<PageResult<HistoryItem>> history(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(favoriteService.history(ownerKey(), page, size), requestId());
    }

    /** 记录或刷新当前归属人的观看时间。 */
    @PostMapping("/history/{animeId}")
    public ApiResponse<Void> recordHistory(@PathVariable long animeId) {
        favoriteService.recordHistory(ownerKey(), animeId);
        return ApiResponse.ok(null, requestId());
    }

    /** 将当前认证上下文转换为数据库归属键。 */
    private String ownerKey() {
        return OwnerKeys.of(AuthContext.get());
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
