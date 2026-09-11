export function fitNodeSize(width: number, height: number, maxWidth = 640, maxHeight = 640) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export function nodeSizeFromNatural(width: number, height: number, baseWidth: number, baseHeight: number) {
    return nodeSizeFromRatio(`${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`, baseWidth, baseHeight) || { width: baseWidth, height: baseHeight };
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    const shortSide = Math.min(baseWidth, baseHeight);
    return ratio >= 1 ? { width: Math.round(shortSide * ratio), height: shortSide } : { width: shortSide, height: Math.round(shortSide / ratio) };
}
