import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { promptFromLibraryAsset, promptLibraryKey, sameSavedPrompt, snapshotPrompt, type SavedPrompt } from "@/lib/prompt-library";
import { useAssetStore } from "@/stores/use-asset-store";

type PromptLibraryStore = {
    savedPrompts: SavedPrompt[];
    toggleSaved: (prompt: SavedPrompt) => void;
    removeSaved: (key: string) => void;
};

const PROMPT_LIBRARY_STORE_KEY = "infinite-canvas:prompt_library_store";
const PROMPT_LIBRARY_SYNC_CHANNEL = "infinite-canvas:prompt_library_store_sync";

let persistReady = false;
let applyingRemote = false;
let promptLibrarySyncChannel: BroadcastChannel | null = null;

const jsonStorage = createJSONStorage(() => localForageStorage)!;

async function applyRemoteSavedPrompts() {
    const value = await jsonStorage.getItem(PROMPT_LIBRARY_STORE_KEY);
    const savedPrompts = value?.state?.savedPrompts;
    if (!Array.isArray(savedPrompts)) return;
    applyingRemote = true;
    try {
        usePromptLibraryStore.setState({ savedPrompts });
    } finally {
        applyingRemote = false;
    }
}

function getPromptLibrarySyncChannel() {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    if (!promptLibrarySyncChannel) {
        promptLibrarySyncChannel = new BroadcastChannel(PROMPT_LIBRARY_SYNC_CHANNEL);
        promptLibrarySyncChannel.onmessage = () => {
            void applyRemoteSavedPrompts();
        };
    }
    return promptLibrarySyncChannel;
}

function mergeSavedPrompts(current: SavedPrompt[], incoming: SavedPrompt[]) {
    const keys = new Set(current.map(promptLibraryKey));
    const added: SavedPrompt[] = [];
    for (const prompt of incoming) {
        const key = promptLibraryKey(prompt);
        if (!key || keys.has(key) || keys.has(prompt.id)) continue;
        keys.add(key);
        added.push(snapshotPrompt(prompt));
    }
    return added.length ? [...added, ...current] : current;
}

function mergeHydratedSavedPrompts(persistedState: unknown, currentState: PromptLibraryStore): PromptLibraryStore {
    const persisted = (persistedState || {}) as Partial<PromptLibraryStore>;
    const persistedPrompts = Array.isArray(persisted.savedPrompts) ? persisted.savedPrompts : [];
    const currentPrompts = currentState.savedPrompts || [];
    const persistedKeys = new Set(persistedPrompts.flatMap((prompt) => {
        const key = promptLibraryKey(prompt);
        return key && key !== prompt.id ? [key, prompt.id] : [prompt.id];
    }));
    const extras = currentPrompts.filter((prompt) => !persistedKeys.has(promptLibraryKey(prompt)) && !persistedKeys.has(prompt.id));
    return { ...currentState, ...persisted, savedPrompts: extras.length ? [...extras, ...persistedPrompts] : persistedPrompts };
}

const promptLibraryStorage: PersistStorage<PromptLibraryStore> = {
    getItem: (name) => jsonStorage.getItem(name),
    setItem: (name, value) => {
        if (!persistReady) return;
        const result = jsonStorage.setItem(name, value);
        if (!applyingRemote) void Promise.resolve(result).then(() => getPromptLibrarySyncChannel()?.postMessage({ type: "ping" }));
        return result;
    },
    removeItem: (name) => jsonStorage.removeItem(name),
};

export function migratePromptLibraryAssets() {
    const { hydrated, assets } = useAssetStore.getState();
    if (!hydrated) return;
    const cloned: SavedPrompt[] = [];
    const remaining = assets.filter((asset) => {
        const prompt = promptFromLibraryAsset(asset);
        if (!prompt) return true;
        cloned.push(prompt);
        return false;
    });
    if (!cloned.length) return;
    usePromptLibraryStore.setState((state) => ({ savedPrompts: mergeSavedPrompts(state.savedPrompts, cloned) }));
    if (remaining.length !== assets.length) useAssetStore.getState().replaceAssets(remaining);
}

export const usePromptLibraryStore = create<PromptLibraryStore>()(
    persist(
        (set) => ({
            savedPrompts: [],
            toggleSaved: (prompt) =>
                set((state) => ({
                    savedPrompts: state.savedPrompts.some((item) => sameSavedPrompt(item, prompt))
                        ? state.savedPrompts.filter((item) => !sameSavedPrompt(item, prompt))
                        : [snapshotPrompt(prompt), ...state.savedPrompts],
                })),
            removeSaved: (key) => set((state) => ({ savedPrompts: state.savedPrompts.filter((item) => promptLibraryKey(item) !== key) })),
        }),
        {
            name: PROMPT_LIBRARY_STORE_KEY,
            version: 1,
            storage: promptLibraryStorage,
            partialize: (state) => ({ savedPrompts: state.savedPrompts }),
            merge: (persistedState, currentState) => mergeHydratedSavedPrompts(persistedState, currentState),
            migrate: (persistedState) => {
                const state = (persistedState || {}) as { savedPrompts?: SavedPrompt[] };
                return { savedPrompts: Array.isArray(state.savedPrompts) ? state.savedPrompts : [] };
            },
            onRehydrateStorage: () => (state, error) => {
                persistReady = true;
                getPromptLibrarySyncChannel();
                if (!error) {
                    const savedPrompts = (state || usePromptLibraryStore.getState()).savedPrompts.slice();
                    usePromptLibraryStore.setState({ savedPrompts });
                }
                const tryMigrate = () => {
                    if (!useAssetStore.getState().hydrated) return false;
                    migratePromptLibraryAssets();
                    return true;
                };
                if (tryMigrate()) return;
                const unsub = useAssetStore.subscribe((assetState) => {
                    if (!assetState.hydrated) return;
                    unsub();
                    migratePromptLibraryAssets();
                });
            },
        },
    ),
);

if (typeof window !== "undefined") queueMicrotask(() => getPromptLibrarySyncChannel());

