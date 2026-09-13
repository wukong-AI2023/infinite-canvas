export const PROMPT_LIBRARY_SOURCE = "prompt-library";
export const PROMPT_LIBRARY_SAVED_TAG = "__prompt_saved";

export type SavedPrompt = {
    id: string;
    sourceId: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    createdAt: string;
    updatedAt: string;
    author?: string;
    sourceUrl?: string;
    githubUrl: string;
    category: string;
};

export function promptLibraryKey(prompt: { id: string; sourceId?: string }) {
    return prompt.sourceId ? `${prompt.sourceId}:${prompt.id}` : prompt.id;
}

export function isPromptLibraryFilterTag(tag: string) {
    return tag === PROMPT_LIBRARY_SAVED_TAG;
}

export function isPromptLibraryAsset(asset: { kind: string; metadata?: Record<string, unknown> }) {
    return asset.kind === "text" && asset.metadata?.source === PROMPT_LIBRARY_SOURCE;
}

export function snapshotPrompt(prompt: SavedPrompt): SavedPrompt {
    return {
        id: prompt.id,
        sourceId: prompt.sourceId || "",
        title: prompt.title,
        prompt: prompt.prompt,
        description: prompt.description || "",
        coverUrl: prompt.coverUrl || "",
        referenceImageUrls: Array.isArray(prompt.referenceImageUrls) ? prompt.referenceImageUrls : [],
        tags: Array.isArray(prompt.tags) ? prompt.tags : [],
        preview: prompt.preview || "",
        createdAt: prompt.createdAt || "",
        updatedAt: prompt.updatedAt || "",
        author: prompt.author,
        sourceUrl: prompt.sourceUrl,
        githubUrl: prompt.githubUrl || "",
        category: prompt.category || "",
    };
}

export function sameSavedPrompt(item: { id: string; sourceId?: string }, prompt: { id: string; sourceId?: string }) {
    if (promptLibraryKey(item) === promptLibraryKey(prompt)) return true;
    return (!item.sourceId || !prompt.sourceId) && item.id === prompt.id;
}

export function promptMatchesSaved(savedPrompts: Array<{ id: string; sourceId?: string }>, prompt: { id: string; sourceId?: string }) {
    return savedPrompts.some((item) => sameSavedPrompt(item, prompt));
}

export function promptFromLibraryAsset(asset: {
    kind: string;
    title: string;
    coverUrl?: string;
    tags?: string[];
    source?: string;
    createdAt?: string;
    updatedAt?: string;
    data?: { content?: string };
    metadata?: Record<string, unknown>;
}): SavedPrompt | null {
    if (!isPromptLibraryAsset(asset)) return null;
    const promptId = String(asset.metadata?.promptId || "");
    if (!promptId) return null;
    return {
        id: promptId,
        sourceId: String(asset.metadata?.sourceId || ""),
        title: asset.title,
        prompt: asset.data?.content || "",
        description: "",
        coverUrl: asset.coverUrl || "",
        referenceImageUrls: [],
        tags: asset.tags || [],
        preview: "",
        createdAt: asset.createdAt || "",
        updatedAt: asset.updatedAt || "",
        githubUrl: String(asset.metadata?.githubUrl || ""),
        category: asset.source || "",
    };
}
