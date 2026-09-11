function sizeFromShortSide(ratio: number, baseWidth: number, baseHeight: number) {
    const shortSide = Math.min(baseWidth, baseHeight);
    return ratio >= 1 ? { width: Math.round(shortSide * ratio), height: shortSide } : { width: shortSide, height: Math.round(shortSide / ratio) };
}

export function nodeSizeFromNatural(width: number, height: number, baseWidth: number, baseHeight: number) {
    return sizeFromShortSide(Math.max(1, width) / Math.max(1, height), baseWidth, baseHeight);
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    return sizeFromShortSide(ratio, baseWidth, baseHeight);
}
