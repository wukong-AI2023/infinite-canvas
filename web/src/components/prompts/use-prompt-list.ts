import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { promptLibraryKey, PROMPT_LIBRARY_SAVED_TAG } from "@/lib/prompt-library";
import { ALL_PROMPTS_OPTION, fetchPrompts } from "@/services/api/prompts";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({ keyword, tags, category, enabled = true }: { keyword: string; tags: string[]; category: string; enabled?: boolean }) {
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(timer);
    }, [keyword]);
    const savedPrompts = usePromptLibraryStore((state) => state.savedPrompts);
    const useSaved = tags.includes(PROMPT_LIBRARY_SAVED_TAG);
    const savedKey = useMemo(() => savedPrompts.map(promptLibraryKey).sort().join("|"), [savedPrompts]);
    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, tags, category, useSaved, useSaved ? savedKey : null],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword: debouncedKeyword, tag: tags, category, page: pageParam, pageSize: PROMPT_PAGE_SIZE, savedPrompts: useSaved ? savedPrompts : [] }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled,
        placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[4] === useSaved ? previousData : undefined),
    });
    const firstPage = query.data?.pages[0];
    return {
        query,
        items: useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]),
        tags: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.tags || [])], [firstPage?.tags]),
        categories: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.categories || [])], [firstPage?.categories]),
        total: firstPage?.total || 0,
    };
}
