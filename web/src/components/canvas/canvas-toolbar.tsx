import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { Group, Image as ImageIcon, Music2, Plus, Puzzle, Settings2, Type, Video } from "lucide-react";

import { canvasThemes, isDarkTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { useTranslation } from "react-i18next";
import { NodeCreateMenu } from "./canvas-create-menus";

export function CanvasToolbar({
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddConfig,
    onAddGroup,
    onAddExtensionNode,
    onUpload,
    onCreateNode,
}: {
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onAddGroup: () => void;
    onAddExtensionNode: (type: string) => void;
    onUpload: () => void;
    onCreateNode: (type: string) => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [hovered, setHovered] = useState<string | null>(null);
    const [tipY, setTipY] = useState(0);
    const [extensionsOpen, setExtensionsOpen] = useState(false);
    const [extPanelY, setExtPanelY] = useState(0);
    const [createMenuOpen, setCreateMenuOpen] = useState(false);
    const createMenuCloseTimerRef = useRef<number | null>(null);
    // Keep extension plugin nodes synchronized with registry changes.
    useNodeRegistryVersion();
    const extensionDefs = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: isDarkTheme(colorTheme) ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const hoverStyle = { background: theme.toolbar.itemHover, color: theme.toolbar.activeText };
    const plusStyle = { background: isDarkTheme(colorTheme) ? theme.node.text : theme.node.panel, color: isDarkTheme(colorTheme) ? theme.node.panel : theme.node.text };
    const placeholderStyle = { background: theme.toolbar.itemHover, borderColor: theme.toolbar.border };
    const tip = hovered ? toolLabel(hovered, t) : "";

    const openCreateMenu = () => {
        if (createMenuCloseTimerRef.current !== null) window.clearTimeout(createMenuCloseTimerRef.current);
        setCreateMenuOpen(true);
    };
    const scheduleCloseCreateMenu = () => {
        if (createMenuCloseTimerRef.current !== null) window.clearTimeout(createMenuCloseTimerRef.current);
        createMenuCloseTimerRef.current = window.setTimeout(() => setCreateMenuOpen(false), 120);
    };

    // Close the extension-node popover when clicking outside the toolbar and its panel.
    useEffect(() => {
        if (!extensionsOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setExtensionsOpen(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [extensionsOpen]);

    useEffect(() => () => {
        if (createMenuCloseTimerRef.current !== null) window.clearTimeout(createMenuCloseTimerRef.current);
    }, []);

    return (
        <div ref={rootRef} className="pointer-events-none absolute left-5 top-1/2 z-50 flex -translate-y-1/2 justify-start">
            {tip ? <DockTip label={tip} y={tipY} theme={theme} /> : null}
            <div ref={wrapRef} className="hide-scrollbar pointer-events-auto flex max-h-[calc(100vh-32px)] w-12 flex-col items-center gap-2.5 overflow-y-auto rounded-full border px-2 py-2 shadow-lg backdrop-blur [&>*]:shrink-0" style={dockStyle}>
                <button
                    type="button"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition"
                    style={plusStyle}
                    aria-label={t("canvas.createMenu.select")}
                    onMouseEnter={openCreateMenu}
                    onMouseLeave={scheduleCloseCreateMenu}
                    onFocus={openCreateMenu}
                    onBlur={scheduleCloseCreateMenu}
                    onClick={openCreateMenu}
                >
                    <Plus className="size-5" strokeWidth={2.2} />
                </button>
                <ToolbarButton id="tool-text" label={t("canvas.toolbar.text")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddText}>
                    <Type className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-image" label={t("canvas.toolbar.image")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddImage}>
                    <ImageIcon className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-video" label={t("canvas.toolbar.video")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddVideo}>
                    <Video className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-audio" label={t("canvas.toolbar.audio")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddAudio}>
                    <Music2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-config" label={t("canvas.toolbar.config")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddConfig}>
                    <Settings2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-group" label={t("canvas.toolbar.group")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipY={setTipY} onHover={setHovered} onClick={onAddGroup}>
                    <Group className="size-4.5" />
                </ToolbarButton>
                {extensionDefs.length ? (
                    <ToolbarButton
                        id="tool-extensions"
                        label={t("canvas.toolbar.extensions")}
                        active={extensionsOpen}
                        hovered={hovered}
                        activeStyle={activeStyle}
                        hoverStyle={hoverStyle}
                        wrapRef={wrapRef}
                        onTipY={setTipY}
                        onHover={setHovered}
                        onClick={(event) => {
                            setExtPanelY(getTipY(wrapRef.current, event.currentTarget));
                            setExtensionsOpen((value) => !value);
                        }}
                    >
                        <Puzzle className="size-4.5" />
                    </ToolbarButton>
                ) : null}
                <div className="grid size-9 shrink-0 place-items-center rounded-full border" style={placeholderStyle} aria-hidden="true" />
            </div>

            {createMenuOpen ? (
                <NodeCreateMenu
                    position={{ x: 54, y: 9 }}
                    scale={1}
                    onCreate={(type) => {
                        onCreateNode(type);
                        setCreateMenuOpen(false);
                    }}
                    onUpload={() => {
                        onUpload();
                        setCreateMenuOpen(false);
                    }}
                    onClose={() => setCreateMenuOpen(false)}
                    onMouseEnter={openCreateMenu}
                    onMouseLeave={scheduleCloseCreateMenu}
                />
            ) : null}

            {extensionsOpen && extensionDefs.length ? (
                <div
                    className="thin-scrollbar pointer-events-auto absolute left-[64px] z-30 max-h-[50vh] w-[240px] -translate-y-1/2 overflow-y-auto rounded-2xl border p-2 shadow-xl backdrop-blur"
                    style={{ top: extPanelY || "50%", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="px-1.5 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.extensions")}</div>
                    <div className="grid gap-0.5">
                        {extensionDefs.map((def) => (
                            <button
                                key={def.type}
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
                                style={{ color: theme.toolbar.item }}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                    onAddExtensionNode(def.type);
                                    setExtensionsOpen(false);
                                }}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md text-base" style={{ background: theme.toolbar.itemHover }}>
                                    {def.icon}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{def.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

        </div>
    );
}

function ToolbarButton({
    id,
    label,
    active,
    hovered,
    activeStyle,
    hoverStyle,
    wrapRef,
    onTipY,
    onHover,
    onClick,
    disabled = false,
    danger = false,
    children,
}: {
    id: string;
    label: string;
    active?: boolean;
    hovered: string | null;
    activeStyle?: CSSProperties;
    hoverStyle: CSSProperties;
    wrapRef: RefObject<HTMLDivElement | null>;
    onTipY: (y: number) => void;
    onHover: (id: string | null) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <Button
            type="text"
            aria-label={label}
            className="!h-8 !w-8 !min-w-8 !p-0"
            disabled={disabled}
            style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? "#f87171" : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
            icon={children}
            onMouseEnter={(event) => {
                onHover(id);
                onTipY(getTipY(wrapRef.current, event.currentTarget));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
        />
    );
}

function DockTip({ label, y, theme }: { label: string; y: number; theme: CanvasTheme }) {
    return (
        <span className="absolute left-[64px] -translate-y-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-xs shadow-lg" style={{ top: y, background: theme.node.text, color: theme.node.panel }}>
            {label}
        </span>
    );
}

function toolLabel(id: string, t: (key: string) => string) {
    if (id === "tool-select") return t("canvas.toolbar.select");
    if (id === "tool-pan") return t("canvas.toolbar.pan");
    if (id === "tool-undo") return t("canvas.undo");
    if (id === "tool-redo") return t("canvas.redo");
    if (id === "tool-text") return t("canvas.toolbar.text");
    if (id === "tool-image") return t("canvas.toolbar.image");
    if (id === "tool-video") return t("canvas.toolbar.video");
    if (id === "tool-audio") return t("canvas.toolbar.audio");
    if (id === "tool-config") return t("canvas.toolbar.config");
    if (id === "tool-group") return t("canvas.toolbar.group");
    if (id === "tool-extensions") return t("canvas.toolbar.extensions");
    if (id === "tool-upload") return t("canvas.toolbar.upload");
    if (id === "tool-style") return t("canvas.toolbar.appearance");
    if (id === "tool-delete") return t("canvas.deleteSelected");
    if (id === "tool-clear") return t("canvas.toolbar.clear");
    return "";
}

function getTipY(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.top - wrapBox.top + box.height / 2;
}
