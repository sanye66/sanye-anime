package com.sanye.anime.sanye_ai_chat.model;

/**
 * 保存 AI 回答偏好请求体：temperature（0-1）、contextLength（4096/8192/16384）、
 * modelName（可选，≤50 字）均可为空，为空表示使用服务端默认。
 */
public record SavePreferenceBody(Double temperature, Integer contextLength, String modelName) {
}
