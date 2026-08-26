package com.sanye.anime.sanye_ai_chat.model;

/**
 * SSE 事件名常量，与 docs/api-contract.md 第 7.2 节对齐。
 */
public final class SseEvents {

    public static final String MESSAGE_ACCEPTED = "message.accepted";
    public static final String MESSAGE_DELTA = "message.delta";
    public static final String RECOMMENDATION = "recommendation";
    public static final String MESSAGE_COMPLETED = "message.completed";
    public static final String MESSAGE_FAILED = "message.failed";
    public static final String MESSAGE_STOPPED = "message.stopped";

    /** 工具常量类禁止实例化。 */
    private SseEvents() {
    }
}
