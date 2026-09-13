import { displayPromptTag, isModelNameTag } from "@/lib/prompt-tag-labels";

export const PROMPT_TAG_GROUP_IDS = ["videoTemplate", "poster", "illustration", "threeD", "portrait", "product", "scene", "uiDoc", "lifestyle", "style", "model", "other"] as const;

export type PromptTagGroupId = (typeof PROMPT_TAG_GROUP_IDS)[number];

export type PromptTagGroup = {
    id: PromptTagGroupId;
    tags: string[];
};

const KEYWORD_GROUPS: { id: Exclude<PromptTagGroupId, "videoTemplate" | "threeD" | "model" | "other">; keys: string[] }[] = [
    { id: "poster", keys: ["海报", "poster", "封面", "typography", "广告设计", "advertising", "social poster"] },
    { id: "illustration", keys: ["插画", "漫画", "动漫", "动画", "anime", "illustration", "卡牌", "card", "candy", "文字渲染", "text render"] },
    { id: "portrait", keys: ["头像", "人像", "角色", "character", "portrait", "cosplay", "扮演", "肖像"] },
    { id: "product", keys: ["产品", "电商", "品牌", "logo", "commerce", "product", "brand"] },
    { id: "scene", keys: ["场景", "风景", "摄影", "写实", "建筑", "architecture", "photography", "scene", "realistic", "食物", "美食", "food"] },
    { id: "uiDoc", keys: ["ui", "界面", "ppt", "信息图", "infographic", "chart", "图表", "文档", "document", "education", "教育", "科学", "science"] },
    { id: "lifestyle", keys: ["工作", "生活", "有趣", "吐槽", "表情", "学习", "总结", "旅游", "travel", "穿搭", "装修", "滤镜", "想象", "社交", "舞蹈", "短视频", "文章", "故事"] },
    { id: "style", keys: ["古风", "历史", "history", "古典", "时尚", "fashion", "科技", "tech", "nsfw", "限制", "cinematic", "创意", "creative", "特效", "奇幻", "科幻", "游戏", "武侠"] },
];

function haystack(tag: string) {
    return `${tag} ${displayPromptTag(tag)}`.toLowerCase().replace(/[_/&]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasKey(hay: string, key: string) {
    if (/[\u4e00-\u9fff]/.test(key) || key.includes(" ") || key.length > 3) return hay.includes(key);
    return new RegExp(`(?:^| )${key}(?: |$)`).test(hay);
}

export function resolvePromptTagGroup(tag: string): PromptTagGroupId {
    const compact = tag.replace(/\s+/g, "");
    if (compact.startsWith("视频模板")) return "videoTemplate";
    if (isModelNameTag(tag)) return "model";
    if (/3d|手办|潮玩/i.test(`${compact} ${tag}`)) return "threeD";
    const hay = haystack(tag.replace(/^\s*图像模板\s*[-–—:：]?\s*/, ""));
    return KEYWORD_GROUPS.find((group) => group.keys.some((key) => hasKey(hay, key)))?.id || "other";
}

export function groupPromptTags(tags: string[]): PromptTagGroup[] {
    const buckets = new Map<PromptTagGroupId, string[]>(PROMPT_TAG_GROUP_IDS.map((id) => [id, []]));
    for (const tag of tags) {
        if (!tag || tag === "all") continue;
        buckets.get(resolvePromptTagGroup(tag))?.push(tag);
    }
    return PROMPT_TAG_GROUP_IDS.flatMap((id) => {
        const items = buckets.get(id) || [];
        return items.length ? [{ id, tags: items }] : [];
    });
}

const IMAGE_TEMPLATE_RE = /^\s*图像模板\s*[-–—:：]?\s*/;
const VIDEO_TEMPLATE_RE = /^\s*视频模板\s*[-–—:：]?\s*/;

export function displayGroupedPromptTag(tag: string, groupId: PromptTagGroupId, locale?: string) {
    const stripped = tag.replace(IMAGE_TEMPLATE_RE, "");
    const next = groupId === "videoTemplate" ? stripped.replace(VIDEO_TEMPLATE_RE, "") : stripped;
    return displayPromptTag(next || tag, locale);
}

export function samePromptTags(left: string[], right: string[]) {
    return left.length === right.length && left.every((tag) => right.includes(tag));
}
