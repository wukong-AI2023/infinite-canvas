import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { Download, Home, Images, Plus, Puzzle, Upload } from "lucide-react";

import { canvasThemes, isDarkTheme } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { useTranslation } from "react-i18next";
import { NodeCreateMenu } from "./canvas-create-menus";

export function CanvasToolbar({
    onHome,
    onProjects,
    onCreateProject,
    onImportAsset,
    onExportProject,
    onAddExtensionNode,
    onUpload,
    onCreateNode,
}: {
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onImportAsset: () => void;
    onExportProject: () => void;
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
            <div ref={wrapRef} className="hide-scrollbar pointer-events-auto flex max-h-[calc(100vh-32px)] w-12 flex-col items-center gap-2.5 overflow-y-auto rounded-full border px-2 py-2 shadow-lg backdrop-blur [&>*]:shrink-0" style={dockStyle}>
                <Tooltip title={t("canvas.createMenu.select")} placement="right" mouseEnterDelay={0.2}>
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
                </Tooltip>
                {extensionDefs.length ? (
                    <ToolbarButton
                        id="tool-extensions"
                        label={t("canvas.toolbar.extensions")}
                        active={extensionsOpen}
                        hovered={hovered}
                        activeStyle={activeStyle}
                        hoverStyle={hoverStyle}
                        onHover={setHovered}
                        onClick={(event) => {
                            setExtPanelY(getTipY(wrapRef.current, event.currentTarget));
                            setExtensionsOpen((value) => !value);
                        }}
                    >
                        <Puzzle className="size-4.5" />
                    </ToolbarButton>
                ) : null}
                <span className="my-0.5 h-px w-6 shrink-0" style={{ background: theme.toolbar.border }} aria-hidden="true" />
                <ToolbarButton id="tool-projects" label={t("canvas.projects")} hovered={hovered} hoverStyle={hoverStyle} onHover={setHovered} onClick={onProjects}>
                    <Images className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-create-project" label={t("canvas.create")} hovered={hovered} hoverStyle={hoverStyle} onHover={setHovered} onClick={onCreateProject}>
                    <Plus className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-import-asset" label={t("canvas.importAsset")} hovered={hovered} hoverStyle={hoverStyle} onHover={setHovered} onClick={onImportAsset}>
                    <Upload className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-export-project" label={t("canvas.exportCurrent")} hovered={hovered} hoverStyle={hoverStyle} onHover={setHovered} onClick={onExportProject}>
                    <Download className="size-4.5" />
                </ToolbarButton>
                <Tooltip title={t("canvas.home")} placement="right" mouseEnterDelay={0.2}>
                    <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border transition hover:opacity-80" style={placeholderStyle} onClick={onHome} aria-label={t("canvas.home")}>
                        <Home className="size-4.5" />
                    </button>
                </Tooltip>
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
    onHover: (id: string | null) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <Tooltip title={label} placement="right" mouseEnterDelay={0.2}>
            <Button
                type="text"
                aria-label={label}
                className="!h-8 !w-8 !min-w-8 !p-0"
                disabled={disabled}
                style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? "#f87171" : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
                icon={children}
                onMouseEnter={() => onHover(id)}
                onMouseLeave={() => onHover(null)}
                onClick={onClick}
            />
        </Tooltip>
    );
}

function getTipY(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.top - wrapBox.top + box.height / 2;
}
