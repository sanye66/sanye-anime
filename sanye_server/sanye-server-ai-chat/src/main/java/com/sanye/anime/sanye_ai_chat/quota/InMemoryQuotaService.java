package com.sanye.anime.sanye_ai_chat.quota;

import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 内存额度实现（联调/降级）：按 ownerKey + 日期计数，进程内原子。
 */
@Service
public class InMemoryQuotaService implements QuotaService {

    private final Map<String, AtomicInteger> usedByOwner = new ConcurrentHashMap<>();

    /** 返回匿名设备每日额度上限。 */
    @Override
    public int anonymousLimit() {
        return 5;
    }

    /** 返回登录用户每日额度上限。 */
    @Override
    public int userLimit() {
        return 30;
    }

    /** 使用原子计数预占额度，超限时回滚本次递增。 */
    @Override
    public QuotaInfoView reserve(String ownerKey, boolean anonymous) {
        int limit = limit(anonymous);
        int used = counter(ownerKey).incrementAndGet();
        if (used > limit) {
            counter(ownerKey).decrementAndGet();
            throw new BusinessException(ErrorCode.QUOTA_EXHAUSTED);
        }
        return new QuotaInfoView(used, limit, resetAt(), anonymous);
    }

    /** 将额度计数减一并限制最低为零。 */
    @Override
    public void refund(String ownerKey, boolean anonymous) {
        counter(ownerKey).updateAndGet(v -> Math.max(0, v - 1));
    }

    /** 返回内存额度的当前快照。 */
    @Override
    public QuotaInfoView info(String ownerKey, boolean anonymous) {
        return new QuotaInfoView(counter(ownerKey).get(), limit(anonymous), resetAt(), anonymous);
    }

    /** 根据匿名/登录身份选择每日额度。 */
    private int limit(boolean anonymous) {
        return anonymous ? anonymousLimit() : userLimit();
    }

    /** 获取按日期隔离的原子计数器。 */
    private AtomicInteger counter(String ownerKey) {
        return usedByOwner.computeIfAbsent(key(ownerKey), k -> new AtomicInteger(0));
    }

    /** 生成当天的内存额度键，跨日自动切换计数。 */
    private String key(String ownerKey) {
        return LocalDate.now() + ":" + ownerKey;
    }

    /** 计算下一自然日零点作为额度重置时间。 */
    private String resetAt() {
        return LocalDate.now().plusDays(1).atStartOfDay().toString();
    }
}
