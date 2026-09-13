import i18n from "@/i18n";

const MODEL_NAME_RE = /^(gpt-?image(?:[-\s]?\d+)?|gpt-?4o(?:-image)?|nano-banana(?:-pro)?)$/i;

const ZH_PROMPT_TAG_LABELS: Record<string, string> = {
    "3d": "3D",
    "3d_cute": "3D可爱",
    "3d_render": "3D渲染",
    advertising: "广告",
    ancient: "古风",
    animation: "动画",
    anime: "动漫",
    anime_adaptation: "动漫改编",
    "anime-adaptation": "动漫改编",
    anime_illustration: "动漫插画",
    architecture: "建筑",
    "architecture & spaces": "建筑与空间",
    article: "文章",
    brand: "品牌",
    "brand & logos": "品牌与标志",
    "candy sculpture": "糖果雕塑",
    card: "卡牌",
    character: "角色",
    "character-portrait": "角色肖像",
    characters: "角色",
    "characters & people": "角色与人物",
    charts: "图表",
    "charts & infographics": "图表与信息图",
    cinematic: "电影感",
    classical: "古典",
    commerce: "商业",
    cosplay: "角色扮演",
    creative: "创意",
    dance_action: "舞蹈动作",
    document: "文档",
    documents: "文档",
    "documents & publishing": "文档与出版",
    education: "教育",
    fashion: "时尚",
    featured: "精选",
    food: "美食",
    game_scifi: "游戏科幻",
    game_ui: "游戏界面",
    history: "历史",
    "history & classical themes": "历史与古典",
    illustration: "插画",
    "illustration & art": "插画与艺术",
    illustration_map: "插画地图",
    infographic: "信息图",
    logo: "标志",
    nsfw: "限制级",
    official: "官方",
    "open-design": "开放设计",
    original: "原创",
    other: "其他",
    "other use cases": "其他用途",
    photography: "摄影",
    "photography & realism": "摄影与写实",
    portrait: "肖像",
    poster: "海报",
    "posters & typography": "海报与字体",
    ppt: "PPT",
    product: "产品",
    product_poster: "产品海报",
    products: "产品",
    "products & e-commerce": "产品与电商",
    realistic: "写实",
    scene: "场景",
    scenes: "场景",
    "scenes & storytelling": "场景与叙事",
    science: "科学",
    short_video: "短视频",
    social: "社交",
    social_dance: "社交舞蹈",
    social_poster: "社交海报",
    story: "故事",
    tech: "科技",
    text_render: "文字渲染",
    travel: "旅行",
    ui: "界面",
    "ui & interfaces": "界面",
    unknown: "未知",
    unkown: "未知",
    vfx_fantasy: "特效奇幻",
    wuxia_history: "武侠历史",
};

function isChineseLocale(locale?: string) {
    return String(locale || i18n.resolvedLanguage || i18n.language || "").toLowerCase().startsWith("zh");
}

export function isModelNameTag(tag: string) {
    return MODEL_NAME_RE.test(tag.trim());
}

export function displayPromptTag(tag: string, locale?: string) {
    if (!tag || !isChineseLocale(locale) || isModelNameTag(tag) || /[\u4e00-\u9fff]/.test(tag)) return tag;
    return ZH_PROMPT_TAG_LABELS[tag.trim().toLowerCase()] || tag;
}
