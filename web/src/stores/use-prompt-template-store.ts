import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import {
    CUSTOM_PROMPT_TEMPLATE_GROUP_ID,
    DEFAULT_PROMPT_TEMPLATE_GROUPS,
    PROMPT_TEMPLATE_SEEDS,
} from "@/lib/prompt-template-seed";
import {
    fallbackTemplateGroupId,
    type PromptTemplate,
    type PromptTemplateGroup,
} from "@/lib/prompt-templates";
import { randomId } from "@/lib/utils";

type PromptTemplatePersist = {
    seeded: boolean;
    knownSeedIds: string[];
    groups: PromptTemplateGroup[];
    items: PromptTemplate[];
};

type PromptTemplateDraft = {
    name: string;
    groupId?: string;
    scene?: string;
    caption?: string;
    positive?: string;
    negative?: string;
    params?: Record<string, string>;
    builtin?: boolean;
};

type PromptTemplateStore = PromptTemplatePersist & {
    addTemplate: (draft: PromptTemplateDraft) => string;
    updateTemplate: (id: string, patch: Partial<PromptTemplateDraft>) => void;
    removeTemplate: (id: string) => void;
    addGroup: (name: string) => string;
    renameGroup: (id: string, name: string) => void;
    removeGroup: (id: string) => void;
};

const PROMPT_TEMPLATE_STORE_KEY = "infinite-canvas:prompt_template_store";
const jsonStorage = createJSONStorage(() => localForageStorage)!;

let persistReady = false;

const promptTemplateStorage: PersistStorage<PromptTemplateStore> = {
    getItem: (name) => jsonStorage.getItem(name),
    setItem: (name, value) => {
        if (!persistReady) return;
        return jsonStorage.setItem(name, value);
    },
    removeItem: (name) => jsonStorage.removeItem(name),
};

function nowIso() {
    return new Date().toISOString();
}

const SEED_BY_ID = new Map(PROMPT_TEMPLATE_SEEDS.map((seed) => [seed.id, seed]));

function syncSeedCopy(item: PromptTemplate): PromptTemplate {
    const seed = SEED_BY_ID.get(item.id);
    if (!seed) return { ...item, caption: item.caption || "" };
    return {
        ...item,
        caption: item.caption?.trim() || seed.caption,
        scene: !item.scene?.trim() || item.scene === seed.caption ? seed.scene : item.scene,
    };
}

function seedItems(now = nowIso()): PromptTemplate[] {
    return PROMPT_TEMPLATE_SEEDS.map((seed) => ({
        ...seed,
        builtin: true,
        createdAt: now,
        updatedAt: now,
    }));
}

function withSeeds(state: PromptTemplatePersist): PromptTemplatePersist {
    if (!state.seeded) {
        return {
            seeded: true,
            knownSeedIds: PROMPT_TEMPLATE_SEEDS.map((seed) => seed.id),
            groups: DEFAULT_PROMPT_TEMPLATE_GROUPS.map((group) => ({ ...group })),
            items: seedItems(),
        };
    }
    const known = new Set(state.knownSeedIds);
    const existingIds = new Set(state.items.map((item) => item.id));
    const addedSeeds = PROMPT_TEMPLATE_SEEDS.filter((seed) => !known.has(seed.id) && !existingIds.has(seed.id));
    const groups = state.groups.slice();
    for (const seed of addedSeeds) {
        if (groups.some((group) => group.id === seed.groupId)) continue;
        const preset = DEFAULT_PROMPT_TEMPLATE_GROUPS.find((group) => group.id === seed.groupId);
        if (preset) groups.push({ ...preset });
    }
    const now = nowIso();
    const items = [
        ...state.items,
        ...addedSeeds.map((seed) => ({ ...seed, builtin: true, createdAt: now, updatedAt: now })),
    ].map(syncSeedCopy);
    return {
        ...state,
        knownSeedIds: addedSeeds.length ? [...state.knownSeedIds, ...addedSeeds.map((seed) => seed.id)] : state.knownSeedIds,
        groups,
        items,
    };
}

function persistSnapshot(state: Partial<PromptTemplatePersist>): PromptTemplatePersist {
    return withSeeds({
        seeded: state.seeded ?? false,
        knownSeedIds: Array.isArray(state.knownSeedIds) ? state.knownSeedIds : [],
        groups: Array.isArray(state.groups) ? state.groups : [],
        items: Array.isArray(state.items) ? state.items : [],
    });
}

export const usePromptTemplateStore = create<PromptTemplateStore>()(
    persist(
        (set, get) => ({
            seeded: false,
            knownSeedIds: [],
            groups: [],
            items: [],
            addTemplate: (draft) => {
                const id = randomId();
                const now = nowIso();
                const groups = get().groups;
                const item: PromptTemplate = {
                    id,
                    name: draft.name.trim(),
                    groupId: fallbackTemplateGroupId(groups, draft.groupId || CUSTOM_PROMPT_TEMPLATE_GROUP_ID),
                    scene: draft.scene?.trim() || "",
                    caption: draft.caption?.trim() || "",
                    positive: draft.positive || "",
                    negative: draft.negative?.trim() ? draft.negative : undefined,
                    params: draft.params,
                    builtin: draft.builtin,
                    createdAt: now,
                    updatedAt: now,
                };
                set({ items: [item, ...get().items] });
                return id;
            },
            updateTemplate: (id, patch) =>
                set((state) => ({
                    items: state.items.map((item) => {
                        if (item.id !== id) return item;
                        const groupId = patch.groupId
                            ? fallbackTemplateGroupId(state.groups, patch.groupId)
                            : item.groupId;
                        return {
                            ...item,
                            name: patch.name === undefined ? item.name : patch.name,
                            groupId,
                            scene: patch.scene === undefined ? item.scene : patch.scene,
                            caption: patch.caption === undefined ? item.caption : patch.caption,
                            positive: patch.positive === undefined ? item.positive : patch.positive,
                            negative: patch.negative === undefined ? item.negative : (patch.negative.trim() ? patch.negative : undefined),
                            params: patch.params === undefined ? item.params : patch.params,
                            builtin: patch.builtin === undefined ? item.builtin : patch.builtin,
                            updatedAt: nowIso(),
                        };
                    }),
                })),
            removeTemplate: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
            addGroup: (name) => {
                const id = randomId();
                set((state) => ({ groups: [...state.groups, { id, name: name.trim() }] }));
                return id;
            },
            renameGroup: (id, name) =>
                set((state) => ({
                    groups: state.groups.map((group) => (group.id === id ? { ...group, name } : group)),
                })),
            removeGroup: (id) =>
                set((state) => {
                    if (state.groups.length <= 1) return state;
                    const groups = state.groups.filter((group) => group.id !== id);
                    const fallbackId = fallbackTemplateGroupId(groups, CUSTOM_PROMPT_TEMPLATE_GROUP_ID);
                    return {
                        groups,
                        items: state.items.map((item) => (item.groupId === id ? { ...item, groupId: fallbackId, updatedAt: nowIso() } : item)),
                    };
                }),
        }),
        {
            name: PROMPT_TEMPLATE_STORE_KEY,
            storage: promptTemplateStorage,
            partialize: (state) => ({
                seeded: state.seeded,
                knownSeedIds: state.knownSeedIds,
                groups: state.groups,
                items: state.items,
            }),
            merge: (persistedState, currentState) => ({
                ...currentState,
                ...persistSnapshot((persistedState || {}) as Partial<PromptTemplatePersist>),
            }),
            onRehydrateStorage: () => (state) => {
                persistReady = true;
                usePromptTemplateStore.setState(persistSnapshot(state || usePromptTemplateStore.getState()));
            },
        },
    ),
);
