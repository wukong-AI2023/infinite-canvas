export type PromptTemplateGroup = {
    id: string;
    name: string;
};

export type PromptTemplate = {
    id: string;
    name: string;
    groupId: string;
    scene: string;
    caption: string;
    positive: string;
    negative?: string;
    params?: Record<string, string>;
    builtin?: boolean;
    createdAt: string;
    updatedAt: string;
};

export type PromptTemplateSeed = Omit<PromptTemplate, "createdAt" | "updatedAt" | "builtin">;

const NEGATIVE_PROMPT_MARKER = "\n\nNegative prompt:\n";

export function formatTemplatePrompt(template: Pick<PromptTemplate, "positive" | "negative">) {
    const positive = template.positive?.trim() || "";
    const negative = template.negative?.trim() || "";
    if (!negative) return positive;
    return `${positive}${NEGATIVE_PROMPT_MARKER}${negative}`;
}

export function templateCaption(template: Pick<PromptTemplate, "caption" | "scene">, max = 16) {
    const text = (template.caption || template.scene).trim();
    if (!text) return "";
    const first = text.split(/[，,；;。]/)[0].trim() || text;
    const chars = Array.from(first);
    return chars.length > max ? `${chars.slice(0, max).join("")}…` : first;
}

export function templateMatchesQuery(template: PromptTemplate, query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [template.name, template.caption, template.scene, template.positive, template.negative]
        .join("\n")
        .toLowerCase()
        .includes(needle);
}

export function fallbackTemplateGroupId(groups: PromptTemplateGroup[], preferred?: string) {
    if (preferred && groups.some((group) => group.id === preferred)) return preferred;
    return groups[0]?.id || "";
}