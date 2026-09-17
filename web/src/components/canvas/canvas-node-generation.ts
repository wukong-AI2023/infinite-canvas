import type { AiTextMessage } from "@/services/api/image";
import i18n from "@/i18n";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasAttachedReference, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { CANVAS_REFERENCE_PATTERN, getGenerationResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getNodeDefinition } from "@/lib/canvas/node-registry";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

type NodeGenerationResourceInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

type NodeGenerationGroupInput = {
    nodeId: string;
    type: "group";
    title: string;
    children: NodeGenerationResourceInput[];
};

export type NodeGenerationInput = NodeGenerationResourceInput | NodeGenerationGroupInput;

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string, options?: { includeAttached?: boolean }): NodeGenerationContext {
    const resourceInputs = flattenGenerationInputs(buildNodeGenerationInputs(nodeId, nodes, connections, options?.includeAttached !== false));
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    const labelByNodeId = new Map(resourceInputs.map((input) => [input.nodeId, generationLabel(input.type, counts[input.type]++)]));
    const referencedPrompt = prompt.replace(CANVAS_REFERENCE_PATTERN, (_match, _kind: string, referenceNodeId: string) => {
        const input = resourceInputs.find((item) => item.nodeId === referenceNodeId);
        const label = labelByNodeId.get(referenceNodeId);
        return input && label ? (input.type === "text" ? `【${label}】` : label) : "";
    });
    const upstreamText = resourceInputs.flatMap((input) => input.text ? [textBlock(labelByNodeId.get(input.nodeId) || input.title, input.text)] : []).join("\n\n");
    const referenceImages = resourceInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = resourceInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = resourceInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
    return {
        prompt: upstreamText ? `${referencedPrompt.trim()}\n\n${upstreamText}` : referencedPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: resourceInputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], includeAttached = true): NodeGenerationInput[] {
    const connected = getGenerationResourceNodes(nodeId, nodes, connections).flatMap(readNodeGenerationResource);
    if (!includeAttached) return connected;
    const target = nodes.find((node) => node.id === nodeId);
    const attached = (target?.metadata?.attachedReferences || []).flatMap(readAttachedGenerationResource);
    const byId = new Map([...connected, ...attached].map((input) => [input.nodeId, input]));
    const ordered: NodeGenerationInput[] = [];
    const seen = new Set<string>();
    (target?.metadata?.referenceOrder || []).forEach((id) => {
        const input = byId.get(id);
        if (!input || seen.has(id)) return;
        ordered.push(input);
        seen.add(id);
    });
    [...connected, ...attached].forEach((input) => {
        if (seen.has(input.nodeId)) return;
        ordered.push(input);
        seen.add(input.nodeId);
    });
    return ordered;
}

function readAttachedGenerationResource(item: CanvasAttachedReference): NodeGenerationResourceInput[] {
    if (!item?.storageKey) return [];
    if (item.kind === "image") {
        return [{ nodeId: item.id, type: "image", title: item.title, image: { id: item.id, name: `${item.title || item.id}.png`, type: "image/png", storageKey: item.storageKey, width: item.width, height: item.height } }];
    }
    return [];
}
function flattenGenerationInputs(inputs: NodeGenerationInput[]) {
    const resources = inputs.flatMap((input) => (input.type === "group" ? input.children : [input]));
    return [...new Map(resources.map((input) => [input.nodeId, input])).values()];
}

function readNodeGenerationResource(node: CanvasNodeData): NodeGenerationResourceInput[] {
    const image = readReferenceImage(node);
    if (image) return [{ nodeId: node.id, type: "image", title: node.title, image }];
    const video = readReferenceVideo(node);
    if (video) return [{ nodeId: node.id, type: "video", title: node.title, video }];
    const audio = readReferenceAudio(node);
    if (audio) return [{ nodeId: node.id, type: "audio", title: node.title, audio }];
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if (resource?.kind === "image" && resource.url) return [{ nodeId: node.id, type: "image", title: node.title, image: { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata?.mimeType || "image/png", dataUrl: resource.url, storageKey: node.metadata?.storageKey, width: node.metadata?.naturalWidth, height: node.metadata?.naturalHeight } }];
    if (resource?.kind === "video" && resource.url) return [{ nodeId: node.id, type: "video", title: node.title, video: { id: node.id, name: `${node.title || node.id}.mp4`, type: node.metadata?.mimeType || "video/mp4", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "audio" && resource.url) return [{ nodeId: node.id, type: "audio", title: node.title, audio: { id: node.id, name: `${node.title || node.id}.mp3`, type: node.metadata?.mimeType || "audio/mpeg", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "text" && resource.text) return [{ nodeId: node.id, type: "text", title: node.title, text: resource.text }];
    const text = readNodeTextInput(node);
    return text ? [{ nodeId: node.id, type: "text", title: node.title, text }] : [];
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    const { readImageMeta } = await import("@/lib/image-utils");
    return {
        ...context,
        referenceImages: await Promise.all(
            context.referenceImages.map(async (image) => {
                const dataUrl = await imageToDataUrl(image);
                if (image.width && image.height) return { ...image, dataUrl };
                const meta = await readImageMeta(dataUrl);
                return { ...image, dataUrl, width: meta.width, height: meta.height };
            }),
        ),
    };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function textBlock(label: string, text: string) {
    return `【${label}】\n${text}`;
}

function generationLabel(type: NodeGenerationResourceInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return i18n.t("canvas.configNode.videoReferences") + ` ${index + 1}`;
    if (type === "audio") return i18n.t("canvas.configNode.audioReferences") + ` ${index + 1}`;
    return i18n.t("canvas.composer.resources.text", { index: index + 1 });
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
