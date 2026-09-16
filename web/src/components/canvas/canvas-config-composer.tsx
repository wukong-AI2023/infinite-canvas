import { useRef } from "react";
import { Button } from "antd";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasPromptChipInput, type CanvasPromptChipInputHandle } from "./canvas-prompt-chip-input";

export type CanvasConfigComposerProps = {
    nodeId: string;
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onClose: () => void;
    onRemoveReference?: (nodeId: string) => void;
    onReorderReferences?: (nodeIds: string[]) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
};

export function CanvasConfigComposer({ nodeId, value, references, onChange, onClose, onRemoveReference, onReorderReferences, onStartReferenceSelection }: CanvasConfigComposerProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<CanvasPromptChipInputHandle>(null);
    return (
        <div data-canvas-no-zoom className="rounded-2xl border p-3 shadow-2xl backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <div className="shrink-0 text-xs font-semibold">{t("canvas.composer.title")}</div>
                    <div className="truncate text-[11px] opacity-55">{t("canvas.composer.description")}</div>
                </div>
                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onClose} />
            </div>
            <CanvasNodeReferenceBar nodeId={nodeId} references={references} onInsert={(reference) => editorRef.current?.insertReference(reference)} onRemove={onRemoveReference} onReorder={onReorderReferences} onStartSelection={onStartReferenceSelection} />
            <CanvasPromptChipInput ref={editorRef} value={value} references={references} onChange={onChange} className="thin-scrollbar min-h-28 max-h-72 w-full overflow-y-auto overscroll-contain px-3 py-2 text-sm leading-7" style={{ color: theme.node.text }} placeholder={t("canvas.composer.placeholder")} />
        </div>
    );
}
