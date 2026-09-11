import { VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/media-size";
import { resolveModelScript, type AiConfig } from "@/stores/use-config-store";

export type ModelScriptResolutionOption = { value: string; label: string };

export type ModelScriptVideoSettings = {
    resolution?: ModelScriptResolutionOption[];
    duration?: { min: number; max: number };
};

const SETTINGS_BLOCK = /\/\*\s*canvas-settings\s*([\s\S]*?)\*\//;

/** Read UI settings from a script comment. The script itself is never executed. */
export function parseModelScriptSettings(script: string | undefined): ModelScriptVideoSettings | undefined {
    const match = String(script || "").match(SETTINGS_BLOCK);
    if (!match) return undefined;
    try {
        const raw = JSON.parse(match[1]) as unknown;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
        const record = raw as Record<string, unknown>;
        const resolution = parseResolutionOptions(record.resolution);
        const duration = parseDurationRange(record.duration);
        if (!resolution && !duration) return undefined;
        return { ...(resolution ? { resolution } : {}), ...(duration ? { duration } : {}) };
    } catch {
        return undefined;
    }
}

export function resolveVideoScriptSettings(config: AiConfig, model?: string) {
    return parseModelScriptSettings(resolveModelScript(config, model || config.model || config.videoModel || ""));
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

export function scriptVideoResolution(value: string, settings?: ModelScriptVideoSettings) {
    if (!settings?.resolution?.length) return undefined;
    return matchScriptResolution(settings.resolution, value)?.value || String(value || "").trim();
}

function parseResolutionOptions(raw: unknown): ModelScriptResolutionOption[] | undefined {
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
