package com.sanye.anime.sanye_core.auth;

import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;

/**
 * 当前请求用户上下文（ThreadLocal），由 AuthContextFilter 设置与清理。
 */
public final class AuthContext {

    private static final ThreadLocal<Context> HOLDER = new ThreadLocal<>();

    public record Context(Long userId, String deviceId, boolean anonymous) {
    }

    /** 上下文工具类禁止实例化。 */
    private AuthContext() {
    }

    /** 将当前请求的认证信息放入线程上下文，供同一请求链路读取。 */
    public static void set(Context context) {
        HOLDER.set(context);
    }

    /** 读取当前认证信息；没有认证信息时以匿名上下文兜底。 */
    public static Context get() {
        Context context = HOLDER.get();
        return context == null ? new Context(null, null, true) : context;
    }

    /** 获取已登录用户编号；匿名请求访问受保护资源时抛出未授权异常。 */
    public static Long requireUserId() {
        Long userId = get().userId();
        if (userId == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId;
    }

    /** 清理线程变量，避免 Web 容器复用线程时串用上一个请求的身份。 */
    public static void clear() {
        HOLDER.remove();
    }
}
