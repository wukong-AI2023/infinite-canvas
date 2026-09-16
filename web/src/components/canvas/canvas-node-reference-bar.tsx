import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { FileText, Image as ImageIcon, Music2, Plus, Video, X } from "lucide-react";
import { Popover } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasNodeReferenceBar({ nodeId, references, onInsert, onRemove, onReorder, onStartSelection }: { nodeId: string; references: CanvasResourceReference[]; onInsert?: (reference: CanvasResourceReference) => void; onRemove?: (nodeId: string) => void; onReorder?: (nodeIds: string[]) => void; onStartSelection?: (nodeId: string) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [previewOrder, setPreviewOrder] = useState(() => references.map((reference) => reference.nodeId));
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const previewOrderRef = useRef(previewOrder);
    const suppressClickRef = useRef(false);

    useEffect(() => {
        if (!draggingId) {
            const next = references.map((reference) => reference.nodeId);
            previewOrderRef.current = next;
            setPreviewOrder(next);
        }
    }, [draggingId, references]);

    const orderedReferences = useMemo(() => {
        const byId = new Map(references.map((reference) => [reference.nodeId, reference]));
        return previewOrder.flatMap((id) => {
            const reference = byId.get(id);
            if (!reference) return [];
            byId.delete(id);
            return [reference];
        }).concat([...byId.values()]);
    }, [previewOrder, references]);

    const moveNear = (targetId: string, after: boolean) => {
        if (!draggingId || draggingId === targetId) return;
        setPreviewOrder((current) => {
            const next = current.filter((id) => id !== draggingId);
            const targetIndex = next.indexOf(targetId);
            next.splice(targetIndex + (after ? 1 : 0), 0, draggingId);
            previewOrderRef.current = next;
            return next;
        });
    };

    const finishDrag = () => {
        if (draggingId) onReorder?.(previewOrderRef.current);
        setDraggingId(null);
        requestAnimationFrame(() => { suppressClickRef.current = false; });
    };

    return (
        <div className="mb-2">
            <div className="mb-1.5 text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("canvas.references.title")}</div>
            <div className="thin-scrollbar flex min-h-12 gap-2 overflow-x-auto pb-1">
                {orderedReferences.map((reference) => {
                    const number = orderedReferences.slice(0, orderedReferences.findIndex((item) => item.nodeId === reference.nodeId) + 1).filter((item) => item.kind === reference.kind).length;
                    return (
                        <ReferenceItem
                            key={reference.nodeId}
                            reference={reference}
                            number={number}
                            dragging={draggingId === reference.nodeId}
                            popoverOpen={draggingId ? false : undefined}
                            onClick={() => {
                                if (suppressClickRef.current) return;
                                onInsert?.(reference);
                            }}
                            onRemove={reference.nodeId === nodeId || !onRemove ? undefined : () => onRemove(reference.nodeId)}
                            onDragStart={(event) => {
                                suppressClickRef.current = true;
                                setDraggingId(reference.nodeId);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", reference.nodeId);
                            }}
                            onDragOverItem={(event) => {
                                event.preventDefault();
                                const rect = event.currentTarget.getBoundingClientRect();
                                moveNear(reference.nodeId, event.clientX > rect.left + rect.width / 2);
                            }}
                            onDragEnd={finishDrag}
                            onDrop={(event) => event.preventDefault()}
                        />
                    );
                })}
                <button type="button" className="grid size-12 shrink-0 place-items-center rounded-xl border bg-transparent transition hover:opacity-70" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }} title={t("canvas.references.select")} onClick={() => onStartSelection?.(nodeId)}>
                    <Plus className="size-4" />
                </button>
            </div>
        </div>
    );
}

function ReferenceItem({ reference, number, dragging, popoverOpen, onClick, onRemove, onDragStart, onDragOverItem, onDragEnd, onDrop }: { reference: CanvasResourceReference; number: number; dragging: boolean; popoverOpen?: boolean; onClick: () => void; onRemove?: () => void; onDragStart: (event: DragEvent<HTMLDivElement>) => void; onDragOverItem: (event: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const Icon = reference.kind === "image" ? ImageIcon : reference.kind === "video" ? Video : reference.kind === "audio" ? Music2 : FileText;
    return (
        <Popover open={popoverOpen} placement="topLeft" mouseEnterDelay={0.15} content={<ReferencePreview reference={reference} />}>
            <div
                draggable
                className="group relative grid size-12 shrink-0 cursor-grab place-items-center rounded-xl border transition active:cursor-grabbing"
                style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border, opacity: dragging ? 0.45 : 1 }}
                title={t("canvas.references.insert", { label: reference.label })}
                onClick={onClick}
                onDragStart={onDragStart}
                onDragOver={onDragOverItem}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
            >
                <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
                    {reference.kind === "image" && reference.previewUrl ? <img src={reference.previewUrl} alt="" className="size-full object-cover" draggable={false} loading="lazy" decoding="async" /> : reference.kind === "video" && reference.previewUrl ? <video src={reference.previewUrl} className="size-full object-cover" muted draggable={false} /> : <Icon className="size-4 opacity-65" />}
                </span>
                <span className="pointer-events-none absolute left-0.5 top-0.5 grid min-w-4 place-items-center rounded px-1 text-[10px] font-semibold leading-4" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{number}</span>
                {onRemove ? <button type="button" draggable={false} className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} aria-label={t("canvas.references.remove")} title={t("canvas.references.remove")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}><X className="size-3" /></button> : null}
            </div>
        </Popover>
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    const { t } = useTranslation();
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt={reference.title} className="max-h-52 w-72 rounded-lg object-contain" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="max-h-52 w-72 rounded-lg" muted controls />;
    if (reference.kind === "audio" && reference.previewUrl) return <audio src={reference.previewUrl} className="w-72" controls />;
    return <div className="max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{reference.text || reference.title || t("canvas.references.empty")}</div>;
}
