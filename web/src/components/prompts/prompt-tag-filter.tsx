import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Tag } from "antd";
import { useTranslation } from "react-i18next";

import { isPromptLibraryFilterTag, PROMPT_LIBRARY_SAVED_TAG } from "@/lib/prompt-library";
import { displayGroupedPromptTag, groupPromptTags, samePromptTags } from "@/lib/prompt-tag-groups";
import { cn } from "@/lib/utils";
import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";

export function useFilterAsideScroll(selectedTags: string[], selectedCategory: string) {
    const ref = useRef<HTMLElement>(null);
    const top = useRef(0);
    const remember = () => {
        top.current = ref.current?.scrollTop ?? 0;
    };
    useLayoutEffect(() => {
        if (ref.current) ref.current.scrollTop = top.current;
    }, [selectedTags, selectedCategory]);
    return { ref, remember };
}

function realPromptTags(tags: string[]) {
    return tags.filter((tag) => !isPromptLibraryFilterTag(tag));
}

function withSavedScope(selectedTags: string[], real: string[]) {
    return selectedTags.includes(PROMPT_LIBRARY_SAVED_TAG) ? [PROMPT_LIBRARY_SAVED_TAG, ...real] : real;
}

export function PromptTagFilter({ tags, selectedTags, onChange }: { tags: string[]; selectedTags: string[]; onChange: (tags: string[]) => void }) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const groups = groupPromptTags(tags);
    const realTags = realPromptTags(selectedTags);
    const savedActive = selectedTags.includes(PROMPT_LIBRARY_SAVED_TAG);
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return onChange([]);
        if (tag === PROMPT_LIBRARY_SAVED_TAG) return onChange(savedActive ? realTags : [PROMPT_LIBRARY_SAVED_TAG, ...realTags]);
        onChange(withSavedScope(selectedTags, realTags.length === 1 && realTags[0] === tag ? [] : [tag]));
    };
    const toggleGroup = (groupTags: string[]) => onChange(withSavedScope(selectedTags, samePromptTags(realTags, groupTags) ? [] : groupTags));
    const renderGroup = (id: string, groupTags: string[], label: string, childLabel: (tag: string) => ReactNode) => {
        const hidden = collapsed[id];
        const groupActive = samePromptTags(realTags, groupTags);
        return (
            <div key={id} className="mt-3">
                <div className="mb-1.5 flex items-center gap-1">
                    <button type="button" className="flex size-5 shrink-0 items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" onClick={() => setCollapsed((state) => ({ ...state, [id]: !state[id] }))}>
                        <ChevronRight className={cn("size-3.5 transition-transform", !hidden && "rotate-90")} />
                    </button>
                    <Tag.CheckableTag checked={groupActive} className={cn("prompt-filter-tag prompt-filter-group", groupActive && "is-active")} onChange={() => toggleGroup(groupTags)}>
                        {label}
                    </Tag.CheckableTag>
                </div>
                {hidden ? null : (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                        {groupTags.map((tag) => {
                            const active = realTags.length === 1 && realTags[0] === tag;
                            return (
                                <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                    {childLabel(tag)}
                                </Tag.CheckableTag>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.tags")}</div>
            <div className="flex flex-wrap gap-1.5">
                <Tag.CheckableTag checked={selectedTags.length === 0} className={cn("prompt-filter-tag", selectedTags.length === 0 && "is-active")} onChange={() => toggleTag(ALL_PROMPTS_OPTION)}>
                    {t("common.all")}
                </Tag.CheckableTag>
                <Tag.CheckableTag checked={savedActive} className={cn("prompt-filter-tag", savedActive && "is-active")} onChange={() => toggleTag(PROMPT_LIBRARY_SAVED_TAG)}>
                    {t("prompts.myPrompts")}
                </Tag.CheckableTag>
            </div>
            {groups.map((group) => renderGroup(group.id, group.tags, t(`prompts.tagGroups.${group.id}`), (tag) => displayGroupedPromptTag(tag, group.id)))}
        </div>
    );
}
