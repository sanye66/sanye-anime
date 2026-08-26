package com.sanye.anime.sanye_favorite;

import com.sanye.anime.sanye_core.auth.AuthContext;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;

/**
 * 归属键：登录用户 user:xxx，匿名设备 device:xxx（CAS 接入后迁移到用户维度）。
 */
public final class OwnerKeys {

    /** 归属键工具类禁止实例化。 */
    private OwnerKeys() {
    }

    /** 优先使用登录用户归属，否则使用设备归属并拒绝缺少设备号的匿名请求。 */
    public static String of(AuthContext.Context context) {
        if (context.userId() != null) {
            return "user:" + context.userId();
        }
        if (context.deviceId() == null || context.deviceId().isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 X-Device-Id 请求头");
        }
        return "device:" + context.deviceId();
    }
}
