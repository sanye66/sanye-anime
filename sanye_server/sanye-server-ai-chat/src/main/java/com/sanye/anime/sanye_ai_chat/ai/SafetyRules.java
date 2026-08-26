package com.sanye.anime.sanye_ai_chat.ai;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 安全与剧透规则（T-E-04，设计 6.5 节）：
 * - 规则文档注入提示词（SAFE 模式）；正式版随 RAG 文档管理，T-E-03 迁移到 ES；
 * - 拒答关键词预检：违法/色情/暴力/侵权类问题直接拒答；
 * - 输出二次校验：SAFE 模式下对剧透敏感问题做泄露检测与替换。
 * 第一批评测用例见 SafetyEvaluationTest，完整评测集在 T-G-04 扩充。
 */
@Component
public class SafetyRules {

    public static final List<String> RULES = List.of(
            "1. 不得透露任何作品的结局、反转、关键剧情或死亡情节，除非用户明确开启“允许剧透”。",
            "2. 用户询问结局或关键剧情时，先提示该内容涉及剧透，并引导其自行观看或开启允许剧透。",
            "3. 不提供违法、色情、暴力、仇恨或侵权内容的实施方法或细节。",
            "4. 涉及现实人物或事件的回答应保持中立、客观，不编造事实。",
            "5. 回答使用中文，简洁自然，优先基于已验证的作品信息。"
    );

    private static final List<String> REFUSAL_KEYWORDS = List.of(
            "毒品制作", "如何杀人", "怎么杀人", "杀人方法", "杀人不会留痕迹",
            "制作炸弹", "炸弹怎么做", "怎么做炸弹", "自制炸弹", "如何做炸弹",
            "色情描写", "人肉搜索", "盗版下载", "破解教程", "自杀方法");

    private static final List<String> SPOILER_SENSITIVE = List.of(
            "结局", "最后", "死了", "凶手", "反转", "复活", "真相", "剧透");

    /**
     * 剧透泄露检测：避免“结局是否…”这类正常问句被误判。
     */
    private static final Pattern SPOILER_LEAK_PATTERN = Pattern.compile(
            "结局是(?!否)|结局就是|凶手是|凶手就是|真相是|真相就是|最终战|死去|牺牲了|复活了|反转是|反转就是");

    /** 返回注入模型提示词的安全规则文本。 */
    public String rulesText() {
        return String.join("\n", RULES);
    }

    /**
     * 拒答预检：命中敏感关键词返回触发词，否则返回空。
     */
    /** 预检违法、色情、侵权等敏感问题并返回命中的触发词。 */
    public Optional<String> refusalReason(String question) {
        if (question == null) {
            return Optional.empty();
        }
        return REFUSAL_KEYWORDS.stream().filter(question::contains).findFirst();
    }

    /**
     * 问题是否涉及剧透敏感内容（用于 SAFE 模式的输出二次校验）。
     */
    /** 判断问题是否包含需要启用剧透保护的意图关键词。 */
    public boolean isSpoilerSensitive(String question) {
        return question != null && SPOILER_SENSITIVE.stream().anyMatch(question::contains);
    }

    /**
     * 输出二次校验：ALLOW 直接放行；SAFE 下命中拒答或剧透泄露时替换为安全文案。
     */
    /** 在 SAFE 模式下对拒答和剧透泄露进行二次过滤，ALLOW 模式原样放行。 */
    public String sanitizeAnswer(String question, String answer, String mode) {
        if ("ALLOW".equals(mode)) {
            return answer;
        }
        Optional<String> refusal = refusalReason(question);
        if (refusal.isPresent()) {
            return refusalText(refusal.get());
        }
        if (isSpoilerSensitive(question) && containsSpoilerLeak(answer)) {
            return "为避免剧透，这部分内容我先不展开。你可以告诉我你想了解角色动机、观看顺序或主题，也可以开启“允许剧透”后再聊。";
        }
        return answer;
    }

    /** 将触发词转换为统一、可继续对话的拒答文案。 */
    public String refusalText(String keyword) {
        return "这类问题（涉及「" + keyword + "」）我无法回答。可以换个角度聊聊作品本身，比如角色、主题或观看顺序。";
    }

    /** 检测回答是否出现高风险剧透句式。 */
    private boolean containsSpoilerLeak(String answer) {
        return answer != null && SPOILER_LEAK_PATTERN.matcher(answer).find();
    }
}
