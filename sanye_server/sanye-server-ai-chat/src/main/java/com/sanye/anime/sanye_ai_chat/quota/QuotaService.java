package com.sanye.anime.sanye_ai_chat.quota;

import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;

/**
 * 额度服务抽象：匿名每日 5 次、登录用户每日 30 次（D-006）。
 * 联调阶段支持 Redis 与内存两种实现；T-E-06 额度系统使用 Redis Lua 原子扣减与对账任务。
 */
public interface QuotaService {

    /** 返回匿名设备每日额度上限。 */
    int anonymousLimit();

    /** 返回登录用户每日额度上限。 */
    int userLimit();

    /**
     * 预占一次额度；超过当日上限抛 QUOTA_EXHAUSTED。
     */
    /** 预占一次额度，超限时抛出业务异常。 */
    QuotaInfoView reserve(String ownerKey, boolean anonymous);

    /**
     * 生成失败且未产出任何内容时退还一次额度。
     */
    /** 对未真正生成内容的请求退还已预占额度。 */
    void refund(String ownerKey, boolean anonymous);

    /** 查询当前使用量、上限和重置时间。 */
    QuotaInfoView info(String ownerKey, boolean anonymous);
}
