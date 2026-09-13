import { Bookmark, BookmarkCheck } from "lucide-react";
import { App, Button } from "antd";
import { useTranslation } from "react-i18next";

import { promptMatchesSaved } from "@/lib/prompt-library";
import { type Prompt } from "@/services/api/prompts";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export function PromptCollectButton({ prompt, size, type = "default" }: { prompt: Prompt; size?: "small"; type?: "text" | "default" }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const saved = usePromptLibraryStore((state) => promptMatchesSaved(state.savedPrompts, prompt));
    const toggleSaved = usePromptLibraryStore((state) => state.toggleSaved);
    const iconClass = size === "small" ? "size-3.5" : "size-4";

    const onClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        toggleSaved(prompt);
        message.success(t(saved ? "prompts.uncollected" : "prompts.collected"));
    };

    return (
        <Button size={size} type={type} icon={saved ? <BookmarkCheck className={iconClass} style={{ color: "#f87171" }} /> : <Bookmark className={iconClass} />} onClick={onClick}>
            {saved ? t("prompts.collected") : t("prompts.favorite")}
        </Button>
    );
}
