import { useAssetCoverSrc } from "@/hooks/use-asset-cover-src";
import type { Asset } from "@/stores/use-asset-store";

export function AssetThumb({ asset, className, alt }: { asset: Asset; className?: string; alt?: string }) {
    const src = useAssetCoverSrc(asset);
    if (asset.kind === "video" && !src) {
        return <video src={`${asset.data.url}#t=0.1`} muted playsInline preload="metadata" className={className} />;
    }
    if (!src) return <div className={className} />;
    return <img src={src} alt={alt || ""} className={className} loading="lazy" decoding="async" draggable={false} />;
}
