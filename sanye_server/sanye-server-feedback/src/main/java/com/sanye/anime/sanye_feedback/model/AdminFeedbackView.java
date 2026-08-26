package com.sanye.anime.sanye_feedback.model;

/**
 * 管理端反馈视图（T-F-03 第二批）。
 */
public record AdminFeedbackView(long id, String title, String user, String type, String priority,
                                String time, String status, String content, String contact) {
}
