import { Search } from "lucide-react";
import { type UIEvent, useEffect, useRef, useState } from "react";
import { App, Empty, Input, Modal, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { PromptTagFilter, useFilterAsideScroll } from "@/components/prompts/prompt-tag-filter";
import { promptLibraryKey } from "@/lib/prompt-library";
import { cn } from "@/lib/utils";
import { PromptCard } from "./prompt-card";
import { usePromptList } from "./use-prompt-list";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef({ enabled: false, fetchNextPage: async () => {} });
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const { query, items, tags: promptTags, categories: promptCategories } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, enabled: open });
    const { ref: filterAsideRef, remember: keepFilterScroll } = useFilterAsideScroll(selectedTags, selectedCategory);
    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };
    const showInitialLoading = query.isLoading && items.length === 0;
    loadMoreRef.current = { enabled: Boolean(query.hasNextPage) && !query.isFetchingNextPage, fetchNextPage: query.fetchNextPage };

    const loadMoreIfNeeded = (container?: HTMLDivElement | null) => {
        if (!container || !loadMoreRef.current.enabled) return;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 160) void loadMoreRef.current.fetchNextPage();
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    useEffect(() => {
        if (!open || showInitialLoading) return;
        const container = listRef.current;
        if (!container) return;
        const check = () => loadMoreIfNeeded(container);
        check();
        const observer = new ResizeObserver(check);
        observer.observe(container);
        return () => observer.disconnect();
    }, [open, showInitialLoading, items.length]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        loadMoreIfNeeded(event.currentTarget);
    };

    return (
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width={880} centered styles={{ content: { display: "flex", flexDirection: "column", maxHeight: "85dvh", overflow: "hidden" }, body: { height: "62dvh", overflow: "hidden", display: "flex", flexDirection: "column" } }}>
            <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-5 overflow-hidden sm:grid-cols-[200px_minmax(0,1fr)]" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <aside ref={filterAsideRef} className="thin-scrollbar h-full min-h-0 overflow-y-auto border-r border-stone-200 pr-4 dark:border-stone-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.category")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {promptCategories.map((category) => (
                            <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => { keepFilterScroll(); setSelectedCategory(category); setSelectedTags([]); }}>
                                {category === ALL_PROMPTS_OPTION ? t("common.all") : category}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                    <div className="mt-5">
                        <PromptTagFilter tags={promptTags} selectedTags={selectedTags} onChange={(tags) => { keepFilterScroll(); setSelectedTags(tags); }} />
                    </div>
                </aside>
                <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                    <Input size="large" className="shrink-0" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t("prompts.searchTitle")} />
                    <div ref={listRef} className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                        {showInitialLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Spin />
                            </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {items.map((item) => (
                                <PromptCard key={promptLibraryKey(item)} item={item} onOpen={() => selectPrompt(item.prompt)} onCopy={() => selectPrompt(item.prompt)} compact />
                            ))}
                        </div>
                        {!showInitialLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.empty")} className="py-8" /> : null}
                        {query.isFetchingNextPage ? (
                            <div className="py-4 text-center">
                                <Spin size="small" />
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </Modal>
    );
}