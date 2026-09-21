const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;

export function isClipboardImageFile(file: File) {
    if (file.type.startsWith("image/")) return true;
    if (file.type && file.type !== "application/octet-stream") return false;
    return IMAGE_EXT.test(file.name);
}

export function imageFilesFromClipboardData(data: DataTransfer | null) {
    if (!data) return [];
    const fromFiles = Array.from(data.files || []).filter(isClipboardImageFile);
    if (fromFiles.length) return fromFiles;
    const files: File[] = [];
    const seen = new Set<string>();
    for (const item of Array.from(data.items || [])) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file || !isClipboardImageFile(file)) continue;
        const key = `${file.type}:${file.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        files.push(file);
    }
    return files;
}

export async function blobToPng(blob: Blob) {
    if (blob.type === "image/png") return blob;
    const bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(blob).catch(() => loadImageFromBlob(blob)) : await loadImageFromBlob(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width;
    canvas.height = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("png");
    context.drawImage(bitmap, 0, 0);
    if ("close" in bitmap) bitmap.close();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png");
    return png;
}

export async function writePngToClipboard(pngPromise: Promise<Blob>) {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
            return;
        } catch {
            const png = await pngPromise;
            try {
                await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
                return;
            } catch {
                await copyImageViaExecCommand(png);
                return;
            }
        }
    }
    await copyImageViaExecCommand(await pngPromise);
}

function loadImageFromBlob(blob: Blob) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("image"));
        };
        image.src = url;
    });
}

async function copyImageViaExecCommand(blob: Blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("image"));
        });
        const holder = document.createElement("div");
        holder.contentEditable = "true";
        holder.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
        holder.append(image);
        document.body.append(holder);
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNode(image);
        selection?.removeAllRanges();
        selection?.addRange(range);
        const ok = document.execCommand("copy");
        selection?.removeAllRanges();
        holder.remove();
        if (!ok) throw new Error("copy");
    } finally {
        URL.revokeObjectURL(url);
    }
}
