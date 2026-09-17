import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { fetchMediaBlob, fetchMediaBlobDirectThenProxy, MEDIA_RESPONSE_ERROR } from "@/services/api/local-proxy";
import { createImageThumbnail } from "@/lib/image-thumbnail";

export type UploadedImage = {
    url: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const previewStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_previews" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const objectUrls = new Map<string, string>();
const previewUrls = new Map<string, string>();
const previewListeners = new Set<() => void>();
let previewRevision = 0;
let previewQueue: Promise<unknown> = Promise.resolve();
const IMAGE_PREVIEW_VERSION = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_REMOTE_LOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;
const GENERATED_IMAGE_DIRECT_TIMEOUT_MS = 8_000;
const GENERATED_IMAGE_PROXY_TIMEOUT_MS = 90_000;
const MODEL_REFERENCE_MAX_EDGE = 1536;
const MODEL_REFERENCE_JPEG_QUALITY = 0.88;
const IMAGE_TIMEOUT_ERROR = "ImageTimeoutError";
const GENERATED_IMAGE_DOWNLOAD_ERROR = "GeneratedImageDownloadError";

type StoredImagePreview = { version: number; blob?: Blob };
type ImageReadOptions = { signal?: AbortSignal; generatedResult?: boolean };

function loadBitmap(blob: Blob) {
    if (typeof createImageBitmap === "function") {
        return createImageBitmap(blob).catch(() => loadImageBitmap(blob));
    }
    return loadImageBitmap(blob);
}

function loadImageBitmap(blob: Blob) {
    return new Promise<HTMLImageElement | null>((resolve) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        image.src = url;
    });
}

function closeBitmap(image: ImageBitmap | HTMLImageElement) {
    if ("close" in image) image.close();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function createResizedImageBlob(source: { url?: string; storageKey?: string }, options: { maxEdge: number; jpegQuality: number; detectTransparency?: boolean; skipIfWithinMax?: boolean; signal?: AbortSignal }) {
    throwIfAborted(options.signal);
    const stored = source.storageKey ? await getImageBlob(source.storageKey) : null;
    const blob = stored || (source.url ? await fetchImageBlob(source.url) : null);
    if (!blob) return null;
    const bitmap = await loadBitmap(blob);
    if (!bitmap) return null;
    try {
        return await rasterizeBitmap(bitmap, options);
    } finally {
        closeBitmap(bitmap);
    }
}

async function rasterizeBitmap(bitmap: ImageBitmap | HTMLImageElement, options: { maxEdge: number; jpegQuality: number; detectTransparency?: boolean; skipIfWithinMax?: boolean; signal?: AbortSignal }) {
    const sourceWidth = "naturalWidth" in bitmap && bitmap.naturalWidth ? bitmap.naturalWidth : bitmap.width;
    const sourceHeight = "naturalHeight" in bitmap && bitmap.naturalHeight ? bitmap.naturalHeight : bitmap.height;
    const maxEdge = Math.max(sourceWidth, sourceHeight);
    if (options.skipIfWithinMax && maxEdge <= options.maxEdge) return null;
    const scale = Math.min(1, options.maxEdge / Math.max(maxEdge, 1));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    throwIfAborted(options.signal);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", options.detectTransparency ? { willReadFrequently: true } : undefined);
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    throwIfAborted(options.signal);
    let hasTransparency = false;
    if (options.detectTransparency) {
        const pixels = context.getImageData(0, 0, width, height).data;
        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] < 255) {
                hasTransparency = true;
                break;
            }
        }
    }
    const mimeType = hasTransparency ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, mimeType, hasTransparency ? undefined : options.jpegQuality);
    throwIfAborted(options.signal);
    return blob ? { blob, width, height, mimeType } : null;
}

export async function uploadImage(input: string | Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    if (typeof input !== "string") return storeImage(input, options);

    let blob: Blob;
    try {
        blob = await fetchImageBlob(input, options);
    } catch (error) {
        if (options?.signal?.aborted || options?.generatedResult || isNamedError(error, MEDIA_RESPONSE_ERROR) || isNamedError(error, IMAGE_TIMEOUT_ERROR) || !/^https?:\/\//i.test(input)) throw error;
        const meta = await loadImageMeta(input, options, IMAGE_REMOTE_LOAD_TIMEOUT_MS);
        if (!meta) throw error;
        return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
    }
    return storeImage(blob, options);
}

export function uploadGeneratedImage(input: string | Blob, options?: ImageReadOptions) {
    return uploadImage(input, { ...options, generatedResult: true });
}

async function storeImage(blob: Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const storageKey = `image:${nanoid()}`;
    const url = URL.createObjectURL(blob);
    try {
        const meta = await loadImageMeta(url, options);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        throwIfAborted(options?.signal);
        await store.setItem(storageKey, blob);
        throwIfAborted(options?.signal);
        objectUrls.set(storageKey, url);
        await storeImagePreview(storageKey, blob);
        return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
    } catch (error) {
        URL.revokeObjectURL(url);
        await store.removeItem(storageKey).catch(() => undefined);
        throw error;
    }
}

async function fetchImageBlob(url: string, options?: ImageReadOptions) {
    if (options?.generatedResult && /^https?:\/\//i.test(url)) {
        try {
            return await fetchMediaBlobDirectThenProxy(url, { signal: options.signal }, GENERATED_IMAGE_DIRECT_TIMEOUT_MS, GENERATED_IMAGE_PROXY_TIMEOUT_MS);
        } catch (error) {
            if (options.signal?.aborted) throw abortReason(options.signal);
            throw namedError(GENERATED_IMAGE_DOWNLOAD_ERROR, i18n.t("common.generatedImageDownloadFailed"));
        }
    }
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (options?.signal?.aborted) abort();
    else options?.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, IMAGE_DOWNLOAD_TIMEOUT_MS);
    try {
        return await fetchMediaBlob(url, { signal: controller.signal });
    } catch (error) {
        if (timedOut) throw namedError(IMAGE_TIMEOUT_ERROR);
        if (options?.signal?.aborted) throw abortReason(options.signal);
        throw error;
    } finally {
        window.clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
    }
}

function loadImageMeta(url: string, options?: ImageReadOptions, timeoutMs = IMAGE_DECODE_TIMEOUT_MS) {
    return new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        if (options?.signal?.aborted) return reject(abortReason(options.signal));
        const image = new Image();
        let settled = false;
        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const abort = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            reject(abortReason(options!.signal!));
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        options?.signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
        image.onerror = () => finish(null);
        image.src = url;
    });
}

function namedError(name: string, message = i18n.t("common.imageReadFailed")) {
    const error = new Error(message);
    error.name = name;
    return error;
}

function isNamedError(error: unknown, name: string) {
    return error instanceof Error && error.name === name;
}

function abortReason(signal: AbortSignal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw abortReason(signal);
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

// 缩略图按图片的 storageKey 另存一份 WebP，只放在本地 IndexedDB 里，不写进节点数据，也不参与导出和 WebDAV 同步。
export function previewUrlFor(storageKey?: string) {
    return storageKey ? previewUrls.get(storageKey) : undefined;
}

// 缩略图在后台补，生成完成后再让用到它的界面重渲染一次。
export function subscribeImagePreviews(listener: () => void) {
    previewListeners.add(listener);
    return () => {
        previewListeners.delete(listener);
    };
}

export function getImagePreviewRevision() {
    return previewRevision;
}

export async function ensureImagePreview(storageKey?: string) {
    if (!storageKey) return undefined;
    const cached = previewUrls.get(storageKey);
    if (cached) return cached;
    const stored = await previewStore.getItem<StoredImagePreview>(storageKey).catch(() => null);
    if (stored?.blob) {
        const url = cacheImagePreview(storageKey, stored.blob);
        if (stored.version !== IMAGE_PREVIEW_VERSION) queueImagePreview(storageKey);
        return url;
    }
    if (stored?.version === IMAGE_PREVIEW_VERSION) return undefined;
    queueImagePreview(storageKey);
    return undefined;
}

// 缩略图生成排成一队，避免一次打开大量图片时同时解码。
function queueImagePreview(storageKey: string) {
    previewQueue = previewQueue
        .then(async () => {
            const original = await getImageBlob(storageKey);
            if (original) await storeImagePreview(storageKey, original);
        })
        .catch(() => undefined);
}

async function storeImagePreview(storageKey: string, original: Blob) {
    const preview = await createImageThumbnail(original).catch(() => undefined);
    await previewStore.setItem<StoredImagePreview>(storageKey, { version: IMAGE_PREVIEW_VERSION, blob: preview }).catch(() => undefined);
    return preview ? cacheImagePreview(storageKey, preview) : undefined;
}

function cacheImagePreview(storageKey: string, preview: Blob) {
    const url = URL.createObjectURL(preview);
    previewUrls.set(storageKey, url);
    previewRevision += 1;
    previewListeners.forEach((listener) => listener());
    return url;
}

async function deleteImagePreview(storageKey: string) {
    const url = previewUrls.get(storageKey);
    if (url) URL.revokeObjectURL(url);
    previewUrls.delete(storageKey);
    await previewStore.removeItem(storageKey).catch(() => undefined);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    await deleteImagePreview(storageKey);
    await storeImagePreview(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    const stored = image.storageKey ? await getImageBlob(image.storageKey) : null;
    if (stored) return blobToDataUrl(stored);
    const url = image.dataUrl || image.url || "";
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url, options));
}

export function generatedImageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    return imageToDataUrl(image, { ...options, generatedResult: true });
}

export async function prepareReferenceImageDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    throwIfAborted(options?.signal);
    const source = await imageToDataUrl(image, options);
    if (!source) throw new Error(i18n.t("common.imageReadFailed"));
    const blob = await (await fetch(source, { signal: options?.signal })).blob();
    const bitmap = await loadBitmap(blob);
    if (!bitmap) throw new Error(i18n.t("common.imageReadFailed"));
    try {
        const output = await rasterizeBitmap(bitmap, { maxEdge: MODEL_REFERENCE_MAX_EDGE, jpegQuality: MODEL_REFERENCE_JPEG_QUALITY, detectTransparency: true, signal: options?.signal });
        if (!output) throw new Error(i18n.t("common.imageReadFailed"));
        return blobToDataUrl(output.blob);
    } finally {
        closeBitmap(bitmap);
    }
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await deleteImagePreview(key);
            await store.removeItem(key);
        }),
    );
}

let liveCanvasUsage: unknown = null;

export function setLiveCanvasUsage(value: unknown) {
    liveCanvasUsage = value;
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    collectImageStorageKeys(liveCanvasUsage, usedKeys);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    const orphanPreviews: string[] = [];
    await previewStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) orphanPreviews.push(key);
    });
    await Promise.all([deleteStoredImages(unused), ...orphanPreviews.map(deleteImagePreview)]);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    if ("coverStorageKey" in value && typeof value.coverStorageKey === "string" && value.coverStorageKey.startsWith("image:")) keys.add(value.coverStorageKey);
    if ("previewStorageKey" in value && typeof value.previewStorageKey === "string" && value.previewStorageKey.startsWith("image:")) keys.add(value.previewStorageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
