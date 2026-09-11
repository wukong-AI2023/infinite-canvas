import { useEffect } from "react";

import { ensureAssetImageThumbnail, type Asset } from "@/stores/use-asset-store";

export function useAssetCoverSrc(asset: Asset) {
    const pending = asset.kind === "image" && asset.coverStorageKey === undefined;
    useEffect(() => {
        if (pending) void ensureAssetImageThumbnail(asset.id);
    }, [asset.id, pending]);
    if (asset.kind === "text") return "";
    if (asset.kind === "video") return asset.coverUrl;
    if (pending) return "";
    return asset.coverUrl || asset.data.dataUrl;
}
