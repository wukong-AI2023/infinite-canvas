import { previewUrlFor } from "@/services/image-storage";
import { type CanvasNodeData } from "@/types/canvas";

export function canvasImageDisplaySrc(image?: { previewUrl?: string; content?: string; storageKey?: string } | null) {
    return previewUrlFor(image?.storageKey) || image?.previewUrl || image?.content || "";
}

export function canvasNodeDisplaySrc(node?: CanvasNodeData | null) {
    const metadata = node?.metadata;
    const images = metadata?.images;
    const primary = images?.find((image) => image.id === metadata?.primaryImageId) || images?.[0];
    return canvasImageDisplaySrc(primary) || canvasImageDisplaySrc(metadata);
}
