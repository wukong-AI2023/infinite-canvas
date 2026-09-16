import { CANVAS_IMAGE_PREVIEW_MAX_EDGE, createCanvasImagePreview } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeMetadata } from "@/types/canvas";

type PreviewFields = { previewUrl?: string; previewStorageKey: string };
type ApplyPreviewPatch = (patcher: (nodes: CanvasNodeData[]) => CanvasNodeData[]) => void;
type PreviewTarget = {
    nodeId: string;
    imageId?: string;
    sourceKey: string;
    storageKey?: string;
    url?: string;
    content?: string;
    naturalWidth?: number;
    naturalHeight?: number;
};
type PreviewResult = { nodeId: string; imageId?: string; sourceKey?: string; preview: PreviewFields };

const previewCache = new Map<string, PreviewFields>();
const previewJobs = new Map<string, Promise<PreviewFields>>();
const queuedTargets = new Set<string>();
let previewActive = 0;
const previewWaiting: Array<() => void> = [];
const PREVIEW_CONCURRENCY = 2;
const PREVIEW_PATCH_DELAY_MS = 50;
let pendingResults: PreviewResult[] = [];
let patchTimer: ReturnType<typeof setTimeout> | null = null;
let applyPatch: ApplyPreviewPatch | null = null;

export function canvasImageDisplaySrc(image?: { previewUrl?: string; content?: string } | null) {
    return image?.previewUrl || image?.content || "";
}

export function canvasNodeDisplaySrc(node?: CanvasNodeData | null) {
    const metadata = node?.metadata;
    const images = metadata?.images;
    const primary = images?.find((image) => image.id === metadata?.primaryImageId) || images?.[0];
    return canvasImageDisplaySrc(primary) || canvasImageDisplaySrc(metadata);
}

export function canvasImagePreviewFields(image?: { previewUrl?: string; previewStorageKey?: string } | null) {
    return { previewUrl: image?.previewUrl, previewStorageKey: image?.previewStorageKey };
}

export function queueMissingCanvasImagePreviews(nodes: CanvasNodeData[], apply: ApplyPreviewPatch) {
    applyPatch = apply;
    const copies = collectNodePreviewCopies(nodes);
    if (copies.length) {
        pendingResults.push(...copies);
        scheduleFlush();
    }
    collectPreviewTargets(nodes).forEach((target) => {
        const targetKey = `${target.nodeId}:${target.imageId || "node"}:${target.sourceKey}`;
        if (queuedTargets.has(targetKey)) return;
        queuedTargets.add(targetKey);
        void ensurePreview(target)
            .then((preview) => {
                pendingResults.push({ nodeId: target.nodeId, imageId: target.imageId, sourceKey: target.sourceKey, preview });
                scheduleFlush();
            })
            .finally(() => queuedTargets.delete(targetKey));
    });
}

export function isCanvasPreviewOnlyNodesChange(prev: CanvasNodeData[] | undefined, next: CanvasNodeData[]) {
    if (!prev || prev === next) return true;
    if (prev.length !== next.length) return false;
    for (let index = 0; index < prev.length; index += 1) {
        if (prev[index] === next[index]) continue;
        if (!isSameNodeExceptPreview(prev[index], next[index])) return false;
    }
    return true;
}

function collectPreviewTargets(nodes: CanvasNodeData[]) {
    const targets: PreviewTarget[] = [];
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.Image) return;
        const metadata = node.metadata;
        if (!metadata) return;
        const images = metadata.images || [];
        if (images.length) {
            images.forEach((image) => {
                if (!image.content || image.previewStorageKey !== undefined) return;
                targets.push(toTarget(node.id, image, image.id));
            });
            return;
        }
        if (!metadata.content || metadata.previewStorageKey !== undefined) return;
        targets.push(toTarget(node.id, metadata));
    });
    return targets;
}

function collectNodePreviewCopies(nodes: CanvasNodeData[]) {
    const copies: PreviewResult[] = [];
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.Image) return;
        const metadata = node.metadata;
        if (!metadata?.content || metadata.previewStorageKey !== undefined) return;
        const images = metadata.images || [];
        const primary = images.find((image) => image.id === metadata.primaryImageId) || images[0];
        if (primary?.previewStorageKey === undefined) return;
        copies.push({ nodeId: node.id, preview: { previewUrl: primary.previewUrl || primary.content, previewStorageKey: primary.previewStorageKey } });
    });
    return copies;
}

function toTarget(nodeId: string, image: { content?: string; storageKey?: string; naturalWidth?: number; naturalHeight?: number }, imageId?: string): PreviewTarget {
    return {
        nodeId,
        imageId,
        sourceKey: image.storageKey || image.content || "",
        storageKey: image.storageKey,
        url: image.content,
        content: image.content,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    };
}

function scheduleFlush() {
    if (patchTimer || !pendingResults.length) return;
    patchTimer = setTimeout(() => {
        patchTimer = null;
        flushPreviewPatches();
    }, PREVIEW_PATCH_DELAY_MS);
}

function flushPreviewPatches() {
    const results = pendingResults;
    pendingResults = [];
    if (!results.length || !applyPatch) return;
    const byNode = new Map<string, { node?: PreviewResult; images: Map<string, PreviewResult> }>();
    results.forEach((result) => {
        const current = byNode.get(result.nodeId) || { images: new Map() };
        if (result.imageId) current.images.set(result.imageId, result);
        else current.node = result;
        byNode.set(result.nodeId, current);
    });
    applyPatch((nodes) => {
        let changed = false;
        const next = nodes.map((node) => {
            const patch = byNode.get(node.id);
            const metadata = node.metadata;
            if (!metadata) return node;
            let images = metadata.images;
            if (images?.length && patch?.images.size) {
                let imagesChanged = false;
                const nextImages = images.map((image) => {
                    const result = patch.images.get(image.id);
                    if (!result || image.previewStorageKey !== undefined) return image;
                    if ((image.storageKey || image.content) !== result.sourceKey) return image;
                    imagesChanged = true;
                    return { ...image, previewUrl: result.preview.previewUrl, previewStorageKey: result.preview.previewStorageKey };
                });
                if (imagesChanged) images = nextImages;
            }
            const primary = images?.find((image) => image.id === metadata.primaryImageId) || images?.[0];
            const copied = metadata.previewStorageKey === undefined && primary?.previewStorageKey !== undefined ? { previewUrl: primary.previewUrl, previewStorageKey: primary.previewStorageKey } : undefined;
            const generated = patch?.node && metadata.previewStorageKey === undefined && (metadata.storageKey || metadata.content) === patch.node.sourceKey ? patch.node.preview : undefined;
            const nodePreview = generated || copied;
            if (!nodePreview && images === metadata.images) return node;
            changed = true;
            return { ...node, metadata: { ...metadata, ...(images !== metadata.images ? { images } : {}), ...(nodePreview || {}) } };
        });
        return changed ? next : nodes;
    });
}

async function ensurePreview(target: PreviewTarget): Promise<PreviewFields> {
    if (!target.sourceKey) return fallbackPreview(target);
    const cached = previewCache.get(target.sourceKey);
    if (cached) return cached;
    const current = previewJobs.get(target.sourceKey);
    if (current) return current;
    const job = createPreview(target);
    previewJobs.set(target.sourceKey, job);
    void job.finally(() => previewJobs.delete(target.sourceKey));
    return job;
}

async function createPreview(target: PreviewTarget): Promise<PreviewFields> {
    if (isWithinPreviewEdge(target.naturalWidth, target.naturalHeight)) return cachePreview(target.sourceKey, fallbackPreview(target));
    await acquirePreviewSlot();
    try {
        const uploaded = await createCanvasImagePreview({ url: target.url, storageKey: target.storageKey });
        if (!uploaded) return cachePreview(target.sourceKey, fallbackPreview(target));
        return cachePreview(target.sourceKey, { previewUrl: uploaded.url, previewStorageKey: uploaded.storageKey || target.storageKey || "" });
    } catch {
        return cachePreview(target.sourceKey, fallbackPreview(target));
    } finally {
        releasePreviewSlot();
    }
}

function fallbackPreview(target: PreviewTarget): PreviewFields {
    return { previewUrl: target.content, previewStorageKey: target.storageKey || "" };
}

function cachePreview(sourceKey: string, preview: PreviewFields) {
    if (sourceKey) previewCache.set(sourceKey, preview);
    return preview;
}

function isWithinPreviewEdge(width?: number, height?: number) {
    const maxEdge = Math.max(width || 0, height || 0);
    return maxEdge > 0 && maxEdge <= CANVAS_IMAGE_PREVIEW_MAX_EDGE;
}

function acquirePreviewSlot() {
    if (previewActive < PREVIEW_CONCURRENCY) {
        previewActive += 1;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) =>
        previewWaiting.push(() => {
            previewActive += 1;
            resolve();
        }),
    );
}

function releasePreviewSlot() {
    previewActive -= 1;
    const next = previewWaiting.shift();
    if (next) next();
}

function isSameNodeExceptPreview(prev: CanvasNodeData, next: CanvasNodeData) {
    if (prev.id !== next.id || prev.type !== next.type || prev.title !== next.title || prev.width !== next.width || prev.height !== next.height) return false;
    if (prev.position.x !== next.position.x || prev.position.y !== next.position.y) return false;
    return isSameMetadataExceptPreview(prev.metadata, next.metadata);
}

function isPreviewKey(key: string) {
    return key === "previewUrl" || key === "previewStorageKey";
}

function isSameMetadataExceptPreview(prev?: CanvasNodeMetadata, next?: CanvasNodeMetadata) {
    if (prev === next) return true;
    if (!prev || !next) return false;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)].filter((key) => !isPreviewKey(key)));
    for (const key of keys) {
        if (key === "images") {
            if (!isSameImagesExceptPreview(prev.images, next.images)) return false;
            continue;
        }
        if (prev[key as keyof CanvasNodeMetadata] !== next[key as keyof CanvasNodeMetadata]) return false;
    }
    return true;
}

function isSameImagesExceptPreview(prev?: CanvasNodeImage[], next?: CanvasNodeImage[]) {
    if (prev === next) return true;
    if (!prev || !next || prev.length !== next.length) return false;
    return prev.every((image, index) => {
        const other = next[index];
        if (image === other) return true;
        return image.id === other.id && image.status === other.status && image.content === other.content && image.storageKey === other.storageKey && image.naturalWidth === other.naturalWidth && image.naturalHeight === other.naturalHeight && image.bytes === other.bytes && image.mimeType === other.mimeType && image.errorDetails === other.errorDetails;
    });
}
