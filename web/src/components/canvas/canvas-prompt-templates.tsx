import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button, Tooltip } from "antd";
import { LayoutTemplate, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CanvasPromptTemplateDialog, PromptTemplateGroupIcon } from "./canvas-prompt-template-dialog";
import { canvasThemes } from "@/lib/canvas-theme";
import { formatTemplatePrompt, templateCaption } from "@/lib/prompt-templates";
import { usePromptTemplateStore } from "@/stores/use-prompt-template-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasPromptTemplates({ onSelect }: { onSelect: (prompt: string) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const groups = usePromptTemplateStore((state) => state.groups);
    const items = usePromptTemplateStore((state) => state.items);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [manageId, setManageId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const closeOnKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnKey, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnKey, true);
        };
    }, [open]);

    const groupedItems = useMemo(() => {
        return groups
            .map((group) => ({
                group,
                items: items.filter((item) => item.groupId === group.id),
            }))
            .filter((entry) => entry.items.length);
    }, [groups, items]);

    const applyTemplate = (positive: string, negative?: string) => {
        const value = formatTemplatePrompt({ positive, negative });
        if (!value) return;
        onSelect(value);
        setOpen(false);
    };

    const openManage = () => {
        setOpen(false);
        setManageId(items[0]?.id || null);
        setManageOpen(true);
    };

    return (
        <>
            <Tooltip title={t("canvas.promptTemplates.title")}>
                <span ref={buttonRef} className="inline-flex">
                    <Button
                        type="text"
                        className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-lg !p-0 transition-colors"
                        style={{ background: open ? theme.toolbar.activeBg : "transparent", color: open ? theme.toolbar.activeText : theme.node.text }}
                        icon={<LayoutTemplate className="size-3.5" />}
                        onClick={() => setOpen((current) => !current)}
                        onMouseEnter={(event) => { if (!open) event.currentTarget.style.background = theme.toolbar.itemHover; }}
                        onMouseLeave={(event) => { if (!open) event.currentTarget.style.background = "transparent"; }}
                        aria-label={t("canvas.promptTemplates.title")}
                    />
                </span>
            </Tooltip>
            {open && buttonRect ? (
                <SelectorPortal
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    theme={theme}
                    groupedItems={groupedItems}
                    onApply={applyTemplate}
                    onManage={openManage}
                />
            ) : null}
            <CanvasPromptTemplateDialog
                open={manageOpen}
                selectedId={manageId}
                onSelectId={setManageId}
                onClose={() => setManageOpen(false)}
                onApply={(prompt) => {
                    onSelect(prompt);
                    setManageOpen(false);
                }}
            />
        </>
    );
}

function SelectorPortal({
    buttonRect,
    panelRef,
    theme,
    groupedItems,
    onApply,
    onManage,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    groupedItems: Array<{
        group: { id: string; name: string };
        items: Array<{ id: string; name: string; groupId: string; scene: string; caption: string; positive: string; negative?: string }>;
    }>;
    onApply: (positive: string, negative?: string) => void;
    onManage: () => void;
}) {
    const { t } = useTranslation();
    const [activeId, setActiveId] = useState<string | null>(null);
    const width = 520;
    const gap = 8;
    const margin = 12;
    const spaceAbove = buttonRect.top - margin;
    const spaceBelow = window.innerHeight - buttonRect.bottom - margin;
    const placeAbove = spaceAbove >= 280 || spaceAbove >= spaceBelow;
    const available = Math.max(240, (placeAbove ? spaceAbove : spaceBelow) - gap);
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.right - width));
    const style = {
        position: "fixed" as const,
        zIndex: 1200,
        width,
        left,
        maxHeight: available,
        ...(placeAbove ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        border: `1px solid ${theme.toolbar.border}`,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        color: theme.node.text,
    };

    return createPortal(
        <div
            ref={panelRef}
            data-canvas-no-zoom
            className="flex flex-col overflow-hidden"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pt-3">
                {groupedItems.length ? (
                    <div className="grid grid-cols-2 gap-x-4 pb-2">
                        {[groupedItems.slice(0, Math.ceil(groupedItems.length / 2)), groupedItems.slice(Math.ceil(groupedItems.length / 2))].map((column, index) => (
                            <div key={index}>
                                {column.map(({ group, items }) => (
                                    <section key={group.id} className="mb-4">
                                        <div className="mb-1.5 text-xs" style={{ color: theme.node.muted }}>{group.name}</div>
                                        <div className="space-y-2">
                                            {items.map((item) => {
                                                const active = item.id === activeId;
                                                const caption = templateCaption(item);
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className="flex h-14 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors"
                                                        style={{
                                                            background: active ? theme.toolbar.activeBg : "transparent",
                                                        }}
                                                        onMouseEnter={() => setActiveId(item.id)}
                                                        onMouseLeave={() => setActiveId((current) => (current === item.id ? null : current))}
                                                        onFocus={() => setActiveId(item.id)}
                                                        onClick={() => onApply(item.positive, item.negative)}
                                                    >
                                                        <PromptTemplateGroupIcon groupId={item.groupId} className="size-4 shrink-0" />
                                                        <span className="flex min-w-0 flex-1 flex-col justify-center">
                                                            <span className="truncate text-sm leading-5">{item.name}</span>
                                                            {active && caption ? (
                                                                <span className="truncate text-xs leading-4" style={{ color: theme.node.muted }}>{caption}</span>
                                                            ) : null}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.muted }}>
                        {t("canvas.promptTemplates.empty")}
                    </div>
                )}
            </div>
            <div className="flex items-center border-t px-2 py-2" style={{ borderColor: theme.toolbar.border }}>
                <Button type="text" className="!ml-auto !h-8 !bg-transparent !px-2 hover:!bg-black/5 dark:hover:!bg-white/10" icon={<Settings2 className="size-3.5" />} style={{ color: theme.node.text }} onClick={onManage}>
                    {t("canvas.promptTemplates.manage")}
                </Button>
            </div>
        </div>,
        document.body,
    );
}
