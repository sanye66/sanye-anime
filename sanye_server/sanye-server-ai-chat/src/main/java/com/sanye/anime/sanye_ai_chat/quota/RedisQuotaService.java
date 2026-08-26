package com.sanye.anime.sanye_ai_chat.quota;

import com.sanye.anime.sanye_ai_chat.model.QuotaInfoView;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Redis 额度实现：INCR + 当日剩余 TTL 原子计数；Redis 不可用时日志告警并降级到内存计数。
 */
@Service
@Primary
@ConditionalOnProperty(name = "sanye.ai.quota-storage", havingValue = "redis")
public class RedisQuotaService implements QuotaService {

    private static final Logger log = LoggerFactory.getLogger(RedisQuotaService.class);
    private static final String KEY_PREFIX = "sanye:quota:";

    private final StringRedisTemplate redis;
    private final InMemoryQuotaService fallback;

    /** 注入 Redis 客户端和内存降级实现，确保缓存故障不阻断额度查询。 */
    public RedisQuotaService(StringRedisTemplate redis, InMemoryQuotaService fallback) {
        this.redis = redis;
        this.fallback = fallback;
    }

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

    /** 通过 Redis INCR 预占额度，Redis 异常时降级到内存实现。 */
    @Override
    public QuotaInfoView reserve(String ownerKey, boolean anonymous) {
        int limit = limit(anonymous);
        try {
            String key = key(ownerKey);
            Long used = redis.opsForValue().increment(key);
            if (used != null && used == 1L) {
                redis.expire(key, Duration.between(LocalDateTime.now(), LocalDate.now().plusDays(1).atStartOfDay())
                        .plusSeconds(60));
            }
            if (used != null && used > limit) {
                redis.opsForValue().decrement(key);
                throw new BusinessException(ErrorCode.QUOTA_EXHAUSTED);
            }
            return new QuotaInfoView(used == null ? 0 : used.intValue(), limit, resetAt(), anonymous);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.warn("Redis 额度计数不可用，降级内存计数 owner={} error={}", ownerKey, ex.getMessage());
            return fallback.reserve(ownerKey, anonymous);
        }
    }

    /** 退还 Redis 额度并防止计数减到负数。 */
    @Override
    public void refund(String ownerKey, boolean anonymous) {
        try {
            Long used = redis.opsForValue().decrement(key(ownerKey));
            if (used != null && used < 0) {
                redis.opsForValue().increment(key(ownerKey));
            }
        } catch (RuntimeException ex) {
            log.warn("Redis 额度退还不可用，降级内存退还 owner={} error={}", ownerKey, ex.getMessage());
            fallback.refund(ownerKey, anonymous);
        }
    }

    /** 查询 Redis 额度快照，读取失败时回退内存实现。 */
    @Override
    public QuotaInfoView info(String ownerKey, boolean anonymous) {
        int limit = limit(anonymous);
        try {
            String value = redis.opsForValue().get(key(ownerKey));
            int used = value == null ? 0 : Integer.parseInt(value);
            return new QuotaInfoView(used, limit, resetAt(), anonymous);
        } catch (RuntimeException ex) {
            log.warn("Redis 额度查询不可用，降级内存查询 owner={} error={}", ownerKey, ex.getMessage());
            return fallback.info(ownerKey, anonymous);
        }
    }

    /** 根据身份选择额度上限。 */
    private int limit(boolean anonymous) {
        return anonymous ? anonymousLimit() : userLimit();
    }

    /** 生成按日期隔离的 Redis 额度键。 */
    private String key(String ownerKey) {
        return KEY_PREFIX + LocalDate.now() + ":" + ownerKey;
    }

    /** 计算下一自然日零点的重置时间。 */
    private String resetAt() {
        return LocalDate.now().plusDays(1).atStartOfDay().toString();
    }
}
