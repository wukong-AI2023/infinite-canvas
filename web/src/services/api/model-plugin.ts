import axios, { type AxiosRequestConfig } from "axios";

import i18n from "@/i18n";
import { buildApiUrl, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { isBlockedMediaType, mediaResponseError, requestDirectThenProxy, requestMedia } from "./local-proxy";

type RequestOptions = { signal?: AbortSignal };

export type PluginHttpOptions = {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    responseType?: "json" | "blob" | "text" | "arraybuffer";
};

export type PluginHttp = {
    url: (path: string) => string;
    post: (path: string, body?: unknown, options?: PluginHttpOptions) => Promise<unknown>;
    get: (path: string, options?: PluginHttpOptions) => Promise<unknown>;
};

export type PluginPollOptions = { intervalMs?: number; timeoutMs?: number };

export type RunPluginArgs = {
    capability: ModelCapability;
    script: string;
    config: AiConfig;
    prompt?: string;
    images?: string[];
    videos?: File[];
    audios?: File[];
    messages?: unknown[];
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
};

function pluginHeaders(extra?: Record<string, string>, hasJsonBody = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (hasJsonBody) headers["Content-Type"] = "application/json";
    return { ...headers, ...extra };
}

function pluginUrl(config: AiConfig, path: string) {
    if (/^https?:/i.test(path)) return path;
    return buildApiUrl(config.baseUrl, path.startsWith("/") ? path : `/${path}`);
}

function isPluginMediaGet(url: string, method: string | undefined, responseType: string | undefined, apiBaseUrl: string) {
    const verb = (method || "get").toLowerCase();
    if ((verb !== "get" && verb !== "head") || !/^https?:\/\//i.test(url)) return false;
    if (responseType === "blob" || responseType === "arraybuffer") return true;
    try {
        const apiHost = /^https?:\/\//i.test(apiBaseUrl) ? new URL(apiBaseUrl).host : "";
        return Boolean(apiHost && new URL(url).host !== apiHost);
    } catch {
        return false;
    }
}


function asPluginRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parsePluginJson(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return value;
    try {
        return JSON.parse(text);
    } catch {
        return value;
    }
}

function pluginImageRef(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (/^(?:https?:\/\/|data:image\/)/i.test(text)) return text;
    const markdown = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
    if (markdown?.[1]) return markdown[1];
    const url = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || "";
    return /\.(?:png|jpe?g|webp|gif|bmp)(?:\?|#|$)/i.test(url) ? url : "";
}

function pluginTextUrl(value: unknown, loose: boolean) {
    const direct = pluginImageRef(value);
    if (direct) return direct;
    if (!loose || typeof value !== "string") return "";
    const urls = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    return urls.length === 1 ? urls[0] : "";
}

function pluginInlineImage(value: unknown) {
    const record = asPluginRecord(value);
    const data = record && typeof record.data === "string" ? record.data : "";
    if (!data) return "";
    if (data.startsWith("data:image/") || /^https?:\/\//i.test(data)) return data;
    if (data.length < 32 || /[\s{}]/.test(data)) return "";
    return `data:${String(record?.mimeType || record?.mime_type || "image/png")};base64,${data}`;
}

function imageFromPluginPart(part: unknown, allowThought: boolean) {
    const record = asPluginRecord(part);
    if (!record) return pluginTextUrl(part, allowThought);
    if (!allowThought && (record.thought === true || record.thought === "true")) return "";
    const file = asPluginRecord(record.fileData || record.file_data);
    const imageUrl = asPluginRecord(record.image_url || record.imageUrl);
    return (
        pluginInlineImage(record.inlineData || record.inline_data) ||
        pluginImageRef(file?.fileUri || file?.file_uri || record.fileUri || record.file_uri) ||
        pluginImageRef(imageUrl?.url || record.image_url || record.imageUrl || record.url || record.dataUrl) ||
        pluginInlineImage(record) ||
        pluginTextUrl(record.text, allowThought)
    );
}

function pluginPayloads(value: unknown) {
    const seen = new Set<Record<string, unknown>>();
    const out: Record<string, unknown>[] = [];
    const add = (item: unknown) => {
        const rec = asPluginRecord(parsePluginJson(item));
        if (!rec || seen.has(rec)) return;
        seen.add(rec);
        out.push(rec);
        add(rec.data);
        add(rec.result);
        add(rec.response);
        add(rec.payload);
    };
    add(value);
    return out;
}

function collectBodyImages(body: Record<string, unknown>, add: (url: string) => void, allowThought: boolean) {
    const imageUrl = asPluginRecord(body.image_url || body.imageUrl);
    add(pluginImageRef(imageUrl?.url || body.url || body.dataUrl || body.file_uri || body.fileUri || body.image_url || body.imageUrl));
    add(pluginInlineImage(body.inlineData || body.inline_data || body));
    if (typeof body.data === "string") add(pluginImageRef(body.data) || pluginInlineImage({ data: body.data }));
    const content = asPluginRecord(body.content);
    if (Array.isArray(content?.parts)) {
        for (const part of content.parts) add(imageFromPluginPart(part, allowThought));
    }
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    for (const candidate of candidates) {
        const rec = asPluginRecord(candidate);
        if (!rec) continue;
        add(pluginImageRef(rec.url || rec.file_uri || rec.fileUri));
        add(pluginInlineImage(rec.inlineData || rec.inline_data));
        const next = asPluginRecord(rec.content);
        add(pluginImageRef(next?.url || next?.file_uri || next?.fileUri));
        const parts = Array.isArray(next?.parts) ? next.parts : Array.isArray(rec.parts) ? rec.parts : [];
        for (const part of parts) add(imageFromPluginPart(part, allowThought));
    }
    for (const list of [body.data, body.images, body.output]) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const record = asPluginRecord(item);
            if (!record) {
                add(pluginImageRef(item));
                continue;
            }
            add(pluginImageRef(record.url || record.dataUrl));
            if (typeof record.b64_json === "string" && record.b64_json) add(`data:image/png;base64,${record.b64_json}`);
            add(imageFromPluginPart(record, allowThought));
            const nested = asPluginRecord(record.content);
            if (Array.isArray(nested?.parts)) {
                for (const part of nested.parts) add(imageFromPluginPart(part, allowThought));
            }
        }
    }
    const choices = Array.isArray(body.choices) ? body.choices : [];
    for (const choice of choices) {
        const message = asPluginRecord(asPluginRecord(choice)?.message) || asPluginRecord(choice);
        if (!message) continue;
        if (Array.isArray(message.content)) {
            for (const part of message.content) add(imageFromPluginPart(part, allowThought));
        } else {
            add(pluginTextUrl(message.content, allowThought));
        }
        const images = Array.isArray(message.images) ? message.images : [];
        for (const img of images) add(imageFromPluginPart(img, allowThought));
    }
}

export function extractPluginImages(payload: unknown): string[] {
    const parsed = parsePluginJson(payload);
    if (typeof parsed === "string") {
        const url = pluginImageRef(parsed);
        return url ? [url] : [];
    }
    if (Array.isArray(parsed)) {
        return [...new Set(parsed.flatMap((item) => (typeof item === "string" ? [pluginImageRef(item)] : extractPluginImages(item)).filter(Boolean)))];
    }
    const urls: string[] = [];
    const add = (url: string) => {
        if (url && !urls.includes(url)) urls.push(url);
    };
    const bodies = pluginPayloads(parsed);
    for (const body of bodies) collectBodyImages(body, add, false);
    if (!urls.length) for (const body of bodies) collectBodyImages(body, add, true);
    return urls;
}

function readPluginImages(result: unknown): string[] {
    const items = Array.isArray(result) ? result : result == null ? [] : [result];
    return [...new Set(items.flatMap((item) => {
        if (typeof item === "string") return item ? [item] : [];
        const record = asPluginRecord(item);
        if (!record) return [];
        if (typeof record.dataUrl === "string" && record.dataUrl) return [record.dataUrl];
        if (typeof record.url === "string" && record.url) return [record.url];
        if (typeof record.b64_json === "string" && record.b64_json) return [`data:image/png;base64,${record.b64_json}`];
        return extractPluginImages(item);
    }))];
}

function isMissingPluginImageError(message: string) {
    return /未返回图片|没有返回图片|未找到图片|没有图片|no images?|did not return (an )?image/i.test(message);
}

function alignGeminiImageModalities(data: unknown) {
    const body = asPluginRecord(data);
    const config = asPluginRecord(body?.generationConfig) || asPluginRecord(body?.generation_config);
    if (!config) return;
    const existingKey = Array.isArray(config.responseModalities) ? "responseModalities" : Array.isArray(config.response_modalities) ? "response_modalities" : "";
    const mods = existingKey ? (config[existingKey] as unknown[]).map((item) => String(item).toUpperCase()) : [];
    if (mods.join(",") === "IMAGE,TEXT") return;
    if (!mods.includes("IMAGE") && !asPluginRecord(config.imageConfig || config.image_config)) return;
    config[existingKey || "responseModalities"] = ["IMAGE", "TEXT"];
}

function alignPluginRequestData(data: unknown) {
    if (data == null || (typeof FormData !== "undefined" && data instanceof FormData)) return data;
    if (typeof data === "string") {
        const parsed = parsePluginJson(data);
        if (parsed === data || !asPluginRecord(parsed)) return data;
        alignGeminiImageModalities(parsed);
        try {
            return JSON.stringify(parsed);
        } catch {
            return data;
        }
    }
    alignGeminiImageModalities(data);
    return data;
}

async function pluginAxios(config: AiConfig, requestConfig: AxiosRequestConfig & { url: string }, options?: RequestOptions) {
    requestConfig = { ...requestConfig, data: alignPluginRequestData(requestConfig.data) };
    const url = pluginUrl(config, requestConfig.url);
    const run = async (next: string) => {
        const response = await axios.request({ ...requestConfig, url: next, signal: options?.signal });
        const type = String(response.headers["content-type"] || (response.data instanceof Blob ? response.data.type : "") || "");
        if ((requestConfig.responseType === "blob" || requestConfig.responseType === "arraybuffer") && isBlockedMediaType(type)) {
            throw mediaResponseError(response.status);
        }
        return response.data;
    };
    if (isPluginMediaGet(url, requestConfig.method, typeof requestConfig.responseType === "string" ? requestConfig.responseType : undefined, config.baseUrl)) {
        return requestMedia(url, run);
    }
    return requestDirectThenProxy(url, run);
}

function createPluginHttp(config: AiConfig, options?: RequestOptions, onResponse?: (value: unknown) => void): PluginHttp {
    const run = (method: "get" | "post", path: string, body: unknown, opts?: PluginHttpOptions) => {
        const isForm = typeof FormData !== "undefined" && body instanceof FormData;
        return pluginAxios(
            config,
            {
                method,
                url: path,
                data: method === "post" ? body : undefined,
                params: opts?.params,
                headers: pluginHeaders({ Authorization: `Bearer ${config.apiKey}`, ...opts?.headers }, method === "post" && !isForm && body !== undefined),
                responseType: opts?.responseType || "json",
            },
            options,
        ).then((result) => {
            onResponse?.(result);
            return result;
        });
    };
    return {
        url: (path) => pluginUrl(config, path),
        post: (path, body, opts) => run("post", path, body, opts),
        get: (path, opts) => run("get", path, undefined, opts),
    };
}

/** Raw request with no automatic auth header — the script controls method, url, headers, body entirely. */
function createPluginRequest(config: AiConfig, options?: RequestOptions, onResponse?: (value: unknown) => void) {
    return async (requestConfig: AxiosRequestConfig & { url: string }) => {
        const result = await pluginAxios(config, requestConfig, options);
        onResponse?.(result);
        return result;
    };
}

function createPluginFetch(config: AiConfig, options?: RequestOptions, onResponse?: (value: unknown) => void): typeof fetch {
    return async (input, init) => {
        let nextInit = init;
        if (init && typeof init.body === "string") {
            const aligned = alignPluginRequestData(init.body);
            if (aligned !== init.body) nextInit = { ...init, body: aligned };
        }
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = nextInit?.method || (input instanceof Request ? input.method : "GET");
        const media = isPluginMediaGet(url, method, undefined, config.baseUrl);
        const run = async (next: string) => {
            const nextInput = input instanceof Request ? new Request(next, input) : next;
            const response = await fetch(nextInput, { ...nextInit, signal: nextInit?.signal ?? options?.signal, ...(media ? { referrerPolicy: nextInit?.referrerPolicy || "no-referrer" } : {}) });
            if (media && (!response.ok || isBlockedMediaType(response.headers.get("content-type")))) throw mediaResponseError(response.status);
            return response;
        };
        const response = media ? await requestMedia(url, run) : await requestDirectThenProxy(url, run);
        if (onResponse) {
            try {
                const type = response.headers.get("content-type") || "";
                if (/json|text/i.test(type)) onResponse(parsePluginJson(await response.clone().text()));
            } catch {
                /* ignore non-json bodies */
            }
        }
        return response;
    };
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function createPoll(signal?: AbortSignal) {
    return async function poll<T, R>(request: () => Promise<T>, extract: (value: T) => R | null | undefined | false, options?: PluginPollOptions): Promise<R> {
        const intervalMs = options?.intervalMs ?? 2500;
        const timeoutMs = options?.timeoutMs ?? 300000;
        const deadline = performance.now() + timeoutMs;
        for (;;) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const result = extract(await request());
            if (result !== null && result !== undefined && result !== false) return result;
            if (performance.now() >= deadline) throw new Error(i18n.t("modelPlugin.pollTimeout"));
            await sleep(intervalMs, signal);
        }
    };
}

/**
 * Run a user-authored model call script. Locals are injected (see PLUGIN_VARIABLES); templates wrap them in an async function.
 * The script still runs as an async function body and must `return` the result.
 */
export async function runModelPlugin<T = unknown>(args: RunPluginArgs): Promise<T> {
    const { config } = args;
    const collectedImages: string[] = [];
    const collectImages = (value: unknown) => collectedImages.push(...extractPluginImages(value));
    const http = createPluginHttp(config, { signal: args.signal }, collectImages);
    const request = createPluginRequest(config, { signal: args.signal }, collectImages);
    const poll = createPoll(args.signal);
    const pluginFetch = createPluginFetch(config, { signal: args.signal }, collectImages);
    const runner = new Function(
        "prompt",
        "images",
        "videos",
        "audios",
        "messages",
        "params",
        "model",
        "baseUrl",
        "apiKey",
        "systemPrompt",
        "reasoningEffort",
        "http",
        "request",
        "poll",
        "sleep",
        "signal",
        "onDelta",
        "pluginFetch",
        `"use strict"; return (async (fetch) => {\n${args.script}\n})(pluginFetch);`,
    ) as (...fnArgs: unknown[]) => Promise<T>;
    try {
        const result = await runner(
            args.prompt || "",
            args.images || [],
            args.videos || [],
            args.audios || [],
            args.messages || [],
            args.params || {},
            config.model,
            config.baseUrl,
            config.apiKey,
            config.systemPrompt || "",
            config.reasoningEffort,
            http,
            request,
            poll,
            (ms: number) => sleep(ms, args.signal),
            args.signal,
            args.onDelta,
            pluginFetch,
        );
        if (args.capability === "image") {
            const images = readPluginImages(result);
            if (images.length) return images as T;
            const fallback = [...new Set(collectedImages)];
            if (fallback.length) return fallback as T;
        }
        return result;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (axios.isCancel(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (args.capability === "image" && collectedImages.length && isMissingPluginImageError(message)) {
            return [...new Set(collectedImages)] as unknown as T;
        }
        throw new Error(i18n.t("modelPlugin.executionFailed", { message }));
    }
}

export type PluginVariable = { name: string; type: string; desc: string; capabilities?: ModelCapability[] };

/** Documentation surface shown in the script editor. */
export function getPluginVariables(): PluginVariable[] {
    return [
        { name: "prompt", type: "string", desc: i18n.t("modelPlugin.variables.prompt"), capabilities: ["image", "video", "audio"] },
        { name: "images", type: "string[]", desc: i18n.t("modelPlugin.variables.images"), capabilities: ["image", "video"] },
        { name: "videos", type: "File[]", desc: i18n.t("modelPlugin.variables.videos"), capabilities: ["video"] },
        { name: "audios", type: "File[]", desc: i18n.t("modelPlugin.variables.audios"), capabilities: ["video"] },
        { name: "messages", type: "{ role, content }[]", desc: i18n.t("modelPlugin.variables.messages"), capabilities: ["text"] },
        { name: "params", type: "object", desc: i18n.t("modelPlugin.variables.params") },
        { name: "model", type: "string", desc: i18n.t("modelPlugin.variables.model") },
        { name: "baseUrl", type: "string", desc: i18n.t("modelPlugin.variables.baseUrl") },
        { name: "apiKey", type: "string", desc: i18n.t("modelPlugin.variables.apiKey") },
        { name: "systemPrompt", type: "string", desc: i18n.t("modelPlugin.variables.systemPrompt") },
        { name: "reasoningEffort", type: '"auto" | "low" | "medium" | "high" | "xhigh"', desc: i18n.t("modelPlugin.variables.reasoningEffort"), capabilities: ["text"] },
        { name: "http", type: "object", desc: i18n.t("modelPlugin.variables.http") },
        { name: "request", type: "function", desc: i18n.t("modelPlugin.variables.request") },
        { name: "poll", type: "function", desc: i18n.t("modelPlugin.variables.poll") },
        { name: "sleep", type: "function", desc: i18n.t("modelPlugin.variables.sleep") },
        { name: "signal", type: "AbortSignal", desc: i18n.t("modelPlugin.variables.signal") },
        { name: "onDelta", type: "function", desc: i18n.t("modelPlugin.variables.onDelta"), capabilities: ["text"] },
    ];
}

export function getPluginReturn(capability: ModelCapability) {
    return i18n.t(`modelPlugin.returns.${capability}`);
}

export function getPluginAuthoringPrompt(capability: ModelCapability, modelName: string, draft = "") {
    const variables = getPluginVariables().filter((variable) => !variable.capabilities || variable.capabilities.includes(capability));
    const lines = [
        i18n.t("modelPlugin.authoring.intro", { capability: i18n.t(`config.channelEditor.capabilities.${capability}`), model: modelName || i18n.t("modelPlugin.authoring.anyModel") }),
        "",
        i18n.t("modelPlugin.authoring.shape"),
        "",
        i18n.t("modelPlugin.authoring.returnTitle"),
        getPluginReturn(capability),
        "",
        i18n.t("modelPlugin.authoring.variablesTitle"),
        ...variables.map((variable) => `- ${variable.name} (${variable.type}): ${variable.desc}`),
        "",
        i18n.t("modelPlugin.authoring.rulesTitle"),
        i18n.t("modelPlugin.authoring.rules"),
    ];
    if (capability === "video" || capability === "image") lines.push("", i18n.t("modelPlugin.authoring.settings"));
    const templates = getPluginTemplates()[capability];
    if (templates.length) {
        lines.push("", i18n.t("modelPlugin.authoring.examplesTitle"));
        for (const template of templates) {
            lines.push("", `${template.label}`, template.script);
        }
    }
    if (draft.trim()) {
        lines.push("", i18n.t("modelPlugin.authoring.draftTitle"), draft.trim());
    }
    return lines.join("\n");
}

export type PluginTemplate = { label: string; script: string };

export function getPluginTemplates(): Record<ModelCapability, PluginTemplate[]> {
    return {
    image: [
        {
            label: i18n.t("modelPlugin.templates.openai"),
            script: `/**
 * OpenAI image generation and editing.
 * Text-to-image uses POST /v1/images/generations (JSON) when images is empty.
 * Image editing uses POST /v1/images/edits (multipart) when images has data URLs.
 * @param {string} prompt
 * @param {string[]} images - reference images as data URLs; empty for text-to-image
 * @param {object} params
 * @param {string} params.size - output size, e.g. "1024x1024" or "auto"
 * @param {string} params.quality - "low" | "medium" | "high"
 * @param {number} params.count - number of images
 * @param {string} [params.background] - "transparent" when requested
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request - raw HTTP helper; relative urls join baseUrl without /v1
 * @returns {Promise<string[]>} image URLs or data URLs
 */
async function generateImage({
  prompt,
  images,
  params: {
    size,
    quality,
    count,
    background,
  },
  model,
  baseUrl,
  apiKey,
  request,
}) {
  if (images.length === 0) {
    const data = await request({
      method: "post",
      url: \`\${baseUrl}/v1/images/generations\`,
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${apiKey}\`,
      },
      data: {
        model: model,
        prompt: prompt,
        n: count,
        size: size,
        quality: quality,
        background: background,
        response_format: "b64_json",
      },
    });
    const urls = [];
    for (const item of data.data || []) {
      urls.push(item.b64_json ? \`data:image/png;base64,\${item.b64_json}\` : item.url);
    }
    return urls;
  }

  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("n", String(count));
  form.set("size", size);
  form.set("quality", quality);
  form.set("background", background);
  form.set("response_format", "b64_json");
  const imageField = images.length > 1 ? "image[]" : "image";
  for (const dataUrl of images) {
    form.append(imageField, await (await fetch(dataUrl)).blob(), "ref.png");
  }
  const edited = await request({
    method: "post",
    url: \`\${baseUrl}/v1/images/edits\`,
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
    },
    data: form,
  });
  const urls = [];
  for (const item of edited.data || []) {
    urls.push(item.b64_json ? \`data:image/png;base64,\${item.b64_json}\` : item.url);
  }
  return urls;
}

return await generateImage({
  prompt,
  images,
  params,
  model,
  baseUrl,
  apiKey,
  request,
});`,
        },
        {
            label: i18n.t("modelPlugin.templates.gemini"),
            script: `/**
 * Gemini image generation via models/{model}:generateContent.
 * Reference images go into parts.inline_data. size maps to aspectRatio; quality maps to imageSize.
 * @param {string} prompt
 * @param {string[]} images - reference images as data URLs
 * @param {object} params
 * @param {string} params.size - "1024x1024", "16:9", "auto", etc.; sent as aspectRatio
 * @param {string} params.quality - "low" | "medium" | "high"; sent as imageSize 1K/2K/4K
 * @param {number} params.count - number of generateContent calls
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @returns {Promise<string[]>} image data URLs
 */
async function generateImage({
  prompt,
  images,
  params: {
    size,
    quality,
    count,
  },
  model,
  baseUrl,
  apiKey,
  request,
}) {
  const parts = [{ text: prompt }];
  for (const dataUrl of images) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
      parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2],
        },
      });
    }
  }

  const aspectRatioMap = {
    "1024x1024": "1:1",
    "1280x720": "16:9",
    "720x1280": "9:16",
    "1536x1024": "3:2",
    "1024x1536": "2:3",
  };
  const imageSizeMap = {
    low: "1K",
    medium: "2K",
    high: "4K",
  };
  let aspectRatio = "1:1";
  if (size && size !== "auto") {
    aspectRatio = aspectRatioMap[size] || size;
  }
  let imageSize = "1K";
  if (imageSizeMap[quality]) {
    imageSize = imageSizeMap[quality];
  }
  const n = Number(count) || 1;
  const urls = [];

  for (let i = 0; i < n; i++) {
    const data = await request({
      method: "post",
      url: \`\${baseUrl}/v1beta/models/\${model}:generateContent\`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      data: {
        contents: [
          {
            role: "user",
            parts: parts,
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: imageSize,
          },
        },
      },
    });
    const payload = data?.candidates ? data : data?.data || {};
    for (const candidate of payload.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        const img = part.inlineData || part.inline_data;
        if (img && img.data) {
          urls.push(\`data:\${img.mimeType || img.mime_type || "image/png"};base64,\${img.data}\`);
          continue;
        }
        const file = part.fileData || part.file_data;
        const fileUrl = file && (file.fileUri || file.file_uri);
        if (fileUrl) {
          urls.push(fileUrl);
          continue;
        }
        const imageUrl = part.image_url?.url || part.imageUrl?.url || part.image_url || part.imageUrl;
        if (imageUrl) {
          urls.push(imageUrl);
        }
      }
    }
  }
  return urls;
}

return await generateImage({
  prompt,
  images,
  params,
  model,
  baseUrl,
  apiKey,
  request,
});`,
        },
    ],
    video: [
        {
            label: i18n.t("modelPlugin.templates.openai"),
            script: `/**
 * OpenAI-compatible video: POST /v1/videos (multipart), then poll GET /v1/videos/{id}.
 * Do not set Content-Type on FormData; the browser adds the boundary.
 * @param {string} prompt
 * @param {string[]} images - reference images as data URLs
 * @param {File[]} videos - reference videos; empty when none
 * @param {File[]} audios - reference audio; empty when none
 * @param {object} params
 * @param {string} params.mode - "frames" uses first/last frame fields; "reference" sends all images as references. More than 2 images become "reference".
 * @param {string|number} params.seconds - duration
 * @param {string} params.size - output size, e.g. "1280x720"
 * @param {string} params.resolution - e.g. "720p"
 * @param {boolean} params.generateAudio
 * @param {boolean} params.watermark
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @param {function} poll
 * @returns {Promise<{url: string}|Blob>}
 */
async function generateVideo({
  prompt,
  images,
  videos,
  audios,
  params: {
    mode,
    seconds,
    size,
    resolution,
    generateAudio,
    watermark,
  },
  model,
  baseUrl,
  apiKey,
  request,
  poll,
}) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("seconds", String(seconds || 8));
  form.set("size", String(size || "1280x720"));
  form.set("resolution_name", String(resolution || "720p"));
  form.set("generate_audio", String(generateAudio !== false));
  form.set("watermark", String(watermark === true));
  form.set("mode", mode);
  if (mode === "frames") {
    if (images[0]) {
      form.append("first_frame", await (await fetch(images[0])).blob(), "first.png");
    }
    if (images[1]) {
      form.append("last_frame", await (await fetch(images[1])).blob(), "last.png");
    }
  } else {
    for (const dataUrl of images) {
      form.append("image[]", await (await fetch(dataUrl)).blob(), "ref.png");
    }
  }
  for (const file of videos) {
    form.append("video[]", file);
  }
  for (const file of audios) {
    form.append("audio[]", file);
  }

  const headers = {
    Authorization: \`Bearer \${apiKey}\`,
  };
  const task = await request({
    method: "post",
    url: \`\${baseUrl}/v1/videos\`,
    headers,
    data: form,
  });

  return await poll(
    async () => {
      const state = await request({
        method: "get",
        url: \`\${baseUrl}/v1/videos/\${task.id}\`,
        headers,
      });
      if (state.status === "failed" || state.status === "cancelled") {
        throw new Error(state.error && state.error.message ? state.error.message : "video generation failed");
      }
      if (state.video_url || state.url) {
        return { url: state.video_url || state.url };
      }
      if (state.status === "completed") {
        return await request({
          method: "get",
          url: \`\${baseUrl}/v1/videos/\${task.id}/content\`,
          headers,
          responseType: "blob",
        });
      }
      return null;
    },
    (result) => result,
    { intervalMs: 2500, timeoutMs: 300000 },
  );
}

return await generateVideo({
  prompt,
  images,
  videos,
  audios,
  params,
  model,
  baseUrl,
  apiKey,
  request,
  poll,
});`,
        },
        {
            label: i18n.t("modelPlugin.templates.gemini"),
            script: `/**
 * Gemini Veo video: POST models/{model}:predictLongRunning, then poll the operation.
 * First/last-frame mode: images[0] -> image, images[1] -> lastFrame.
 * Reference mode: all images -> referenceImages.
 * @param {string} prompt
 * @param {string[]} images - reference images as data URLs
 * @param {File[]} videos - reference videos; empty when none
 * @param {File[]} audios - reference audio; empty when none
 * @param {object} params
 * @param {string} params.mode - "frames" or "reference"
 * @param {string|number} params.seconds - sent as durationSeconds
 * @param {string} params.size - pixel size; mapped to aspectRatio when needed
 * @param {string} params.ratio - aspect ratio, e.g. "16:9"
 * @param {string} params.resolution - e.g. "720p"
 * @param {boolean} params.generateAudio
 * @param {boolean} params.watermark - sent as addWatermark
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @param {function} poll
 * @returns {Promise<{url: string}>}
 */
async function generateVideo({
  prompt,
  images,
  videos,
  audios,
  params: {
    mode,
    seconds,
    size,
    resolution,
    ratio,
    generateAudio,
    watermark,
  },
  model,
  baseUrl,
  apiKey,
  request,
  poll,
}) {
  async function toInline(source) {
    if (typeof source === "string") {
      const match = source.match(/^data:([^;]+);base64,(.*)$/);
      return {
        bytesBase64Encoded: match ? match[2] : "",
        mimeType: match ? match[1] : "image/png",
      };
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(source);
    });
    const match = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    return {
      bytesBase64Encoded: match ? match[2] : "",
      mimeType: match ? match[1] : (source.type || "application/octet-stream"),
    };
  }

  const aspectRatioMap = {
    "1280x720": "16:9",
    "1920x1080": "16:9",
    "720x1280": "9:16",
    "1080x1920": "9:16",
  };
  let aspectRatio = ratio || size || "16:9";
  if (aspectRatio === "auto") {
    aspectRatio = "16:9";
  }
  if (aspectRatioMap[aspectRatio]) {
    aspectRatio = aspectRatioMap[aspectRatio];
  }

  const instance = {
    prompt: prompt,
  };
  if (mode === "frames") {
    if (images[0]) {
      instance.image = await toInline(images[0]);
    }
    if (images[1]) {
      instance.lastFrame = await toInline(images[1]);
    }
  } else {
    instance.referenceImages = [];
    for (const dataUrl of images) {
      instance.referenceImages.push({
        image: await toInline(dataUrl),
        referenceType: "asset",
      });
    }
  }
  if (videos[0]) {
    instance.video = await toInline(videos[0]);
  }
  if (audios[0]) {
    instance.audio = await toInline(audios[0]);
  }

  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
  const op = await request({
    method: "post",
    url: \`\${baseUrl}/v1beta/models/\${model}:predictLongRunning\`,
    headers,
    data: {
      instances: [instance],
      parameters: {
        aspectRatio: aspectRatio,
        durationSeconds: Number(seconds) || 8,
        resolution: resolution || "720p",
        generateAudio: generateAudio !== false,
        addWatermark: watermark === true,
      },
    },
  });

  return await poll(
    () => request({
      method: "get",
      url: \`\${baseUrl}/v1beta/\${op.name}\`,
      headers,
    }),
    (state) => {
      if (state.error) {
        throw new Error(state.error.message || "video generation failed");
      }
      if (!state.done) return null;
      const uri = state.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error("Gemini did not return a video URI");
      if (uri.includes("key=")) return { url: uri };
      const separator = uri.includes("?") ? "&" : "?";
      return { url: uri + separator + "key=" + apiKey };
    },
    { intervalMs: 5000, timeoutMs: 300000 },
  );
}

return await generateVideo({
  prompt,
  images,
  videos,
  audios,
  params,
  model,
  baseUrl,
  apiKey,
  request,
  poll,
});`,
        },
    ],
    audio: [
        {
            label: i18n.t("modelPlugin.templates.openai"),
            script: `/**
 * OpenAI speech: POST /v1/audio/speech.
 * @param {string} prompt - text to speak
 * @param {object} params
 * @param {string} params.voice
 * @param {string} params.format - response_format, e.g. "mp3"
 * @param {string|number} params.speed
 * @param {string} [params.instructions] - voice style instructions
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @returns {Promise<Blob>}
 */
async function generateAudio({
  prompt,
  params: {
    voice,
    format,
    speed,
    instructions,
  },
  model,
  baseUrl,
  apiKey,
  request,
}) {
  return await request({
    method: "post",
    url: \`\${baseUrl}/v1/audio/speech\`,
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${apiKey}\`,
    },
    responseType: "blob",
    data: {
      model: model,
      input: prompt,
      voice: voice,
      response_format: format,
      speed: Number(speed),
      instructions: instructions,
    },
  });
}

return await generateAudio({
  prompt,
  params,
  model,
  baseUrl,
  apiKey,
  request,
});`,
        },
        {
            label: i18n.t("modelPlugin.templates.gemini"),
            script: `/**
 * Gemini TTS: POST models/{model}:generateContent with AUDIO modality.
 * Audio bytes are returned in inlineData.data (base64 PCM).
 * @param {string} prompt - text to speak
 * @param {object} params
 * @param {string} params.voice - prebuilt voice name
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @returns {Promise<{data: string}>}
 */
async function generateAudio({
  prompt,
  params: {
    voice,
  },
  model,
  baseUrl,
  apiKey,
  request,
}) {
  const data = await request({
    method: "post",
    url: \`\${baseUrl}/v1beta/models/\${model}:generateContent\`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    data: {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    },
  });
  const parts = data.candidates?.[0]?.content?.parts || [];
  let audio = null;
  for (const part of parts) {
    audio = part.inlineData || part.inline_data;
    if (audio && audio.data) break;
  }
  if (!audio || !audio.data) throw new Error("Gemini did not return audio");
  return { data: audio.data };
}

return await generateAudio({
  prompt,
  params,
  model,
  baseUrl,
  apiKey,
  request,
});`,
        },
    ],
    text: [
        {
            label: i18n.t("modelPlugin.templates.openai"),
            script: `/**
 * OpenAI text: POST /v1/responses.
 * @param {{role: string, content: string}[]} messages - includes the system message when present
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {string} reasoningEffort - "auto" | "low" | "medium" | "high" | "xhigh"; omit reasoning when "auto"
 * @param {function} request
 * @param {function} onDelta - push streaming text
 * @returns {Promise<string>}
 */
async function generateText({
  messages,
  model,
  baseUrl,
  apiKey,
  reasoningEffort,
  request,
  onDelta,
}) {
  const body = {
    model: model,
    input: messages,
  };
  if (reasoningEffort && reasoningEffort !== "auto") {
    body.reasoning = {
      effort: reasoningEffort,
    };
  }
  const data = await request({
    method: "post",
    url: \`\${baseUrl}/v1/responses\`,
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${apiKey}\`,
    },
    data: body,
  });
  const text = data.output_text
    || (data.output || []).flatMap((o) => o.content || []).map((c) => c.text || "").join("")
    || "";
  onDelta(text);
  return text;
}

return await generateText({
  messages,
  model,
  baseUrl,
  apiKey,
  reasoningEffort,
  request,
  onDelta,
});`,
        },
        {
            label: i18n.t("modelPlugin.templates.gemini"),
            script: `/**
 * Gemini text: POST models/{model}:generateContent.
 * System messages are skipped in contents; systemPrompt goes to systemInstruction.
 * @param {{role: string, content: string}[]} messages
 * @param {string} systemPrompt
 * @param {string} model
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {function} request
 * @param {function} onDelta - push streaming text
 * @returns {Promise<string>}
 */
async function generateText({
  messages,
  systemPrompt,
  model,
  baseUrl,
  apiKey,
  request,
  onDelta,
}) {
  const contents = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }
  const body = {
    contents: contents,
  };
  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }
  const data = await request({
    method: "post",
    url: \`\${baseUrl}/v1beta/models/\${model}:generateContent\`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    data: body,
  });
  let text = "";
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    text += part.text || "";
  }
  onDelta(text);
  return text;
}

return await generateText({
  messages,
  systemPrompt,
  model,
  baseUrl,
  apiKey,
  request,
  onDelta,
});`,
        },
    ],
    };
}

/** Normalize whatever an image script returns into the app's generated-image shape. */
export function normalizePluginImages(result: unknown): string[] {
    const urls = readPluginImages(result);
    if (!urls.length) throw new Error(i18n.t("modelPlugin.noImages"));
    return urls;
}
