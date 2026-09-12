import { VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/media-size";
import { resolveModelScript, type AiConfig } from "@/stores/use-config-store";

export type ModelScriptResolutionOption = { value: string; label: string };
export type ModelScriptHideField = "quality" | "size" | "background";

export type ModelScriptVideoSettings = {
    resolution?: ModelScriptResolutionOption[];
    duration?: { min: number; max: number };
    quality?: ModelScriptResolutionOption[];
    size?: ModelScriptResolutionOption[];
    hide?: ModelScriptHideField[];
};

export type ModelScriptSettings = ModelScriptVideoSettings;

export type ImageScriptPanelRows = {
    quality: boolean;
    size: boolean;
    resolution: boolean;
    aspect: boolean;
    background: boolean;
    count: true;
};

const SETTINGS_BLOCK = /\/\*\s*canvas-settings\s*([\s\S]*?)\*\//;
const HIDE_FIELDS = new Set<ModelScriptHideField>(["quality", "size", "background"]);

/** Read UI settings from a script comment. The script itself is never executed. */
export function parseModelScriptSettings(script: string | undefined): ModelScriptSettings | undefined {
    const match = String(script || "").match(SETTINGS_BLOCK);
    if (!match) return undefined;
    try {
        const raw = JSON.parse(match[1]) as unknown;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
        const record = raw as Record<string, unknown>;
        const resolution = parseScriptOptions(record.resolution);
        const duration = parseDurationRange(record.duration);
        const quality = parseScriptOptions(record.quality);
        const size = parseScriptOptions(record.size);
        const hide = parseHideFields(record.hide);
        if (!resolution && !duration && !quality && !size && !hide) return undefined;
        return {
            ...(resolution ? { resolution } : {}),
            ...(duration ? { duration } : {}),
            ...(quality ? { quality } : {}),
            ...(size ? { size } : {}),
            ...(hide ? { hide } : {}),
        };
    } catch {
        return undefined;
    }
}

export function resolveVideoScriptSettings(config: AiConfig, model?: string) {
    return parseModelScriptSettings(resolveModelScript(config, model || config.model || config.videoModel || ""));
}

export function resolveImageScriptSettings(config: AiConfig, model?: string) {
    return parseModelScriptSettings(resolveModelScript(config, model || config.model || config.imageModel || ""));
}

export function matchScriptResolution(options: ModelScriptResolutionOption[] | undefined, value: string) {
    if (!options?.length) return undefined;
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    const key = raw.toLowerCase();
    const exact = options.find((item) => item.value.toLowerCase() === key);
    if (exact) return exact;
    const digits = key.replace(/p$/i, "");
    if (!/^\d+$/.test(digits)) return undefined;
    return options.find((item) => item.value.toLowerCase().replace(/p$/i, "") === digits);
}

export function matchScriptSize(options: ModelScriptResolutionOption[] | undefined, value: string) {
    const exact = matchScriptResolution(options, value);
    if (exact) return exact;
    if (!options?.length) return undefined;
    const pixels = String(value || "").trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!pixels) return undefined;
    const width = Number(pixels[1]);
    const height = Number(pixels[2]);
    if (!(width > 0 && height > 0)) return undefined;
    const target = width / height;
    let best: ModelScriptResolutionOption | undefined;
    let bestDiff = Infinity;
    for (const item of options) {
        const ratio = item.value.match(/^(\d+)\s*:\s*(\d+)$/);
        if (!ratio) continue;
        const ratioWidth = Number(ratio[1]);
        const ratioHeight = Number(ratio[2]);
        if (!(ratioWidth > 0 && ratioHeight > 0)) continue;
        const diff = Math.abs(ratioWidth / ratioHeight - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = item;
        }
    }
    return bestDiff <= 0.02 ? best : undefined;
}

export function scriptVideoResolution(value: string, settings?: ModelScriptSettings) {
    if (!settings?.resolution?.length) return undefined;
    return matchScriptResolution(settings.resolution, value)?.value || String(value || "").trim();
}

export function scriptImageQuality(value: string, settings?: ModelScriptSettings) {
    if (!settings?.quality?.length) return undefined;
    return matchScriptResolution(settings.quality, value)?.value || String(value || "").trim();
}

export function scriptImageResolution(value: string, settings?: ModelScriptSettings) {
    if (!settings?.resolution?.length) return undefined;
    return matchScriptResolution(settings.resolution, value)?.value || String(value || "").trim();
}

export function scriptImageSize(value: string, settings?: ModelScriptSettings) {
    if (!settings?.size?.length) return undefined;
    const matched = matchScriptSize(settings.size, value);
    if (matched) return matched.value;
    if (settings.resolution?.length && matchScriptResolution(settings.resolution, value)) {
        return settings.size.find((item) => item.value.toLowerCase() === "auto")?.value || "auto";
    }
    return String(value || "").trim();
}

export function imageScriptPanelRows(settings?: ModelScriptSettings): ImageScriptPanelRows {
    const hide = new Set<ModelScriptHideField>(settings?.hide || []);
    const hasQuality = Boolean(settings?.quality?.length);
    const hasResolution = Boolean(settings?.resolution?.length);
    const hasSize = Boolean(settings?.size?.length);
    const customSizeSystem = hasResolution || hasSize;
    if (hasQuality || customSizeSystem) {
        if (!hasQuality) hide.add("quality");
        if (customSizeSystem) hide.add("size");
    }
    return {
        quality: !hide.has("quality"),
        size: !hide.has("size"),
        resolution: customSizeSystem ? hasResolution : true,
        aspect: customSizeSystem ? hasSize : true,
        background: !hide.has("background"),
        count: true,
    };
}

function parseScriptOptions(raw: unknown): ModelScriptResolutionOption[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const options: ModelScriptResolutionOption[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const option = typeof item === "string"
            ? { value: item.trim(), label: item.trim() }
            : item && typeof item === "object"
                ? {
                    value: String((item as { value?: unknown }).value || "").trim(),
                    label: String((item as { label?: unknown }).label || (item as { value?: unknown }).value || "").trim(),
                }
                : undefined;
        if (!option?.value) continue;
        const key = option.value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ value: option.value, label: option.label || option.value });
    }
    return options.length ? options : undefined;
}

function parseHideFields(raw: unknown): ModelScriptHideField[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const hide: ModelScriptHideField[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const key = String(item || "").trim().toLowerCase();
        if (!HIDE_FIELDS.has(key as ModelScriptHideField) || seen.has(key)) continue;
        seen.add(key);
        hide.push(key as ModelScriptHideField);
    }
    return hide.length ? hide : undefined;
}

function parseDurationRange(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const min = Number((raw as { min?: unknown }).min);
    const max = Number((raw as { max?: unknown }).max);
    if (!Number.isFinite(min) && !Number.isFinite(max)) return undefined;
    const low = Math.floor(Number.isFinite(min) ? min : VIDEO_SECONDS_MIN);
    const high = Math.floor(Number.isFinite(max) ? max : VIDEO_SECONDS_MAX);
    if (low < 1 || high < 1) return undefined;
    return { min: Math.min(low, high), max: Math.max(low, high) };
}
