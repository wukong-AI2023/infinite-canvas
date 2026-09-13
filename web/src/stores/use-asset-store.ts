import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, createImageThumbnail, deleteStoredImages, IMAGE_THUMBNAIL_MAX_EDGE, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    coverStorageKey?: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
const ASSET_SYNC_CHANNEL = "infinite-canvas:asset_store_sync";

let persistReady = false;
let applyingRemote = false;
let assetSyncChannel: BroadcastChannel | null = null;

function getAssetSyncChannel() {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    if (!assetSyncChannel) {
        assetSyncChannel = new BroadcastChannel(ASSET_SYNC_CHANNEL);
        assetSyncChannel.onmessage = () => {
            void applyRemoteAssets();
        };
    }
    return assetSyncChannel;
}

async function applyRemoteAssets() {
    const value = await assetStorage.getItem(ASSET_STORE_KEY);
    const assets = value?.state?.assets;
    if (!Array.isArray(assets)) return;
    applyingRemote = true;
    try {
        useAssetStore.setState({ assets });
    } finally {
        applyingRemote = false;
    }
}

function mergeHydratedAssets(persistedState: unknown, currentState: AssetStore): AssetStore {
    const persisted = (persistedState || {}) as Partial<AssetStore>;
    const persistedAssets = persisted.assets || [];
    const currentAssets = currentState.assets || [];
    const persistedIds = new Set(persistedAssets.map((asset) => asset.id));
    const extras = currentAssets.filter((asset) => !persistedIds.has(asset.id));
    return { ...currentState, ...persisted, assets: extras.length ? [...extras, ...persistedAssets] : persistedAssets };
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverStorageKey
                            ? await resolveImageUrl(asset.coverStorageKey, asset.coverUrl)
                            : asset.coverUrl.startsWith("blob:")
                              ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl)
                              : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => {
        if (!persistReady) return;
        const result = localForageStorage.setItem(name, JSON.stringify(value));
        if (!applyingRemote) void Promise.resolve(result).then(() => getAssetSyncChannel()?.postMessage({ type: "ping" }));
        return result;
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                if (asset.kind === "image") queueAssetThumbnail(id);
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            merge: (persistedState, currentState) => mergeHydratedAssets(persistedState, currentState),
            onRehydrateStorage: () => (state, error) => {
                persistReady = true;
                getAssetSyncChannel();
                if (error) {
                    useAssetStore.setState({ hydrated: true });
                    return;
                }
                const assets = (state || useAssetStore.getState()).assets;
                useAssetStore.setState({ hydrated: true, assets: assets.slice() });
            },
        },
    ),
);

if (typeof window !== "undefined") queueMicrotask(() => getAssetSyncChannel());

const thumbnailJobs = new Map<string, Promise<void>>();
let thumbnailActive = 0;
const thumbnailWaiting: Array<() => void> = [];
const THUMBNAIL_CONCURRENCY = 2;

function queueAssetThumbnail(assetId: string) {
    window.setTimeout(() => {
        void ensureAssetImageThumbnail(assetId);
    }, 0);
}

function acquireThumbnailSlot() {
    if (thumbnailActive < THUMBNAIL_CONCURRENCY) {
        thumbnailActive += 1;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => thumbnailWaiting.push(() => {
        thumbnailActive += 1;
        resolve();
    }));
}

function releaseThumbnailSlot() {
    thumbnailActive -= 1;
    const next = thumbnailWaiting.shift();
    if (next) next();
}

export function ensureAssetImageThumbnail(assetId: string) {
    const current = thumbnailJobs.get(assetId);
    if (current) return current;
    const job = (async () => {
        await acquireThumbnailSlot();
        try {
            const asset = useAssetStore.getState().assets.find((item) => item.id === assetId);
            if (!asset || asset.kind !== "image" || asset.coverStorageKey !== undefined) return;
            const maxEdge = Math.max(asset.data.width || 0, asset.data.height || 0);
            if (maxEdge > 0 && maxEdge <= IMAGE_THUMBNAIL_MAX_EDGE) {
                useAssetStore.getState().updateAsset(assetId, { coverStorageKey: asset.data.storageKey || "", coverUrl: asset.coverUrl || asset.data.dataUrl });
                return;
            }
            const thumb = await createImageThumbnail({ url: asset.data.dataUrl || asset.coverUrl, storageKey: asset.data.storageKey });
            if (!useAssetStore.getState().assets.some((item) => item.id === assetId)) {
                if (thumb?.storageKey) await deleteStoredImages([thumb.storageKey]);
                return;
            }
            if (!thumb) {
                useAssetStore.getState().updateAsset(assetId, { coverStorageKey: asset.data.storageKey || "", coverUrl: asset.coverUrl || asset.data.dataUrl });
                return;
            }
            useAssetStore.getState().updateAsset(assetId, { coverUrl: thumb.url, coverStorageKey: thumb.storageKey });
        } catch {
            const latest = useAssetStore.getState().assets.find((item) => item.id === assetId);
            if (latest?.kind === "image" && latest.coverStorageKey === undefined) {
                useAssetStore.getState().updateAsset(assetId, { coverStorageKey: latest.data.storageKey || "", coverUrl: latest.coverUrl || latest.data.dataUrl });
            }
        } finally {
            releaseThumbnailSlot();
        }
    })();
    thumbnailJobs.set(assetId, job);
    void job.finally(() => thumbnailJobs.delete(assetId));
    return job;
}
