package com.sanye.anime.sanye_ai_chat.ai;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 生成任务注册表：记录每个助手消息的停止标记，供 SSE 停止与断线清理使用。
 * T-E-05 停止/重试/断线补拉在此基础上升级为 token 级取消。
 */
@Component
public class GenerationRegistry {

    private final Map<Long, AtomicBoolean> stopFlags = new ConcurrentHashMap<>();

    /** 注册一次生成任务并重置停止标记。 */
    public void register(long messageId) {
        stopFlags.put(messageId, new AtomicBoolean(false));
    }

    /** 查询生成任务是否收到停止请求。 */
    public boolean isStopped(long messageId) {
        AtomicBoolean flag = stopFlags.get(messageId);
        return flag != null && flag.get();
    }

    /** 设置停止标记，由流式回调在下一片输出前感知。 */
    public void requestStop(long messageId) {
        AtomicBoolean flag = stopFlags.get(messageId);
        if (flag != null) {
            flag.set(true);
        }
    }

    /** 清理已完成、失败或断线的生成任务状态。 */
    public void clear(long messageId) {
        stopFlags.remove(messageId);
    }
}
