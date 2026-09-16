import { useEffect, useSyncExternalStore } from "react";

import { assetCoverUrl, type Asset } from "@/stores/use-asset-store";
import { ensureImagePreview, getImagePreviewRevision, subscribeImagePreviews } from "@/services/image-storage";

export function useAssetCoverSrc(asset: Asset) {
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const storageKey = asset.kind === "image" ? asset.data.storageKey : undefined;
    useEffect(() => {
        if (storageKey) void ensureImagePreview(storageKey);
    }, [storageKey]);
    if (asset.kind === "text") return "";
    if (asset.kind === "video") return asset.coverUrl;
    return assetCoverUrl(asset);
}
