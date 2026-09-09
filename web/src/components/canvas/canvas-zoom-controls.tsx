import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, Segmented, Switch, Tooltip } from "antd";
import { Circle, CircleDot, Compass, Eraser, Focus, Grid2x2, Hand, HelpCircle, Info, Moon, MousePointer2, Palette, Redo2, Square, Sun, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { canvasThemes, isDarkTheme, type CanvasBackgroundMode, type CanvasColorTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    selectedCount: number;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onUndo: () => void;
    onRedo: () => void;
    onDelete: () => void;
    onClear: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
};

export function CanvasZoomControls({
    scale,
    onScaleChange,
    onReset,
    isMiniMapOpen,
    onToggleMiniMap,
    canvasTool,
    canUndo,
    canRedo,
    selectedCount,
    backgroundMode,
    showImageInfo,
    onCanvasToolChange,
    onUndo,
    onRedo,
    onDelete,
    onClear,
    onBackgroundModeChange,
    onShowImageInfoChange,
}: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const actionDockRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: isDarkTheme(colorTheme) ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    useEffect(() => {
        if (!appearanceOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (actionDockRef.current && !actionDockRef.current.contains(event.target as Node)) setAppearanceOpen(false);
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [appearanceOpen]);

    return (
        <div className="absolute bottom-5 left-5 z-50 flex items-end gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-12 items-center gap-1 rounded-2xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <ZoomButton label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")} active={isMiniMapOpen} activeStyle={activeStyle} theme={theme} icon={<Compass className="size-4" />} onClick={onToggleMiniMap} />
                <ZoomButton label={t("canvas.resetView")} theme={theme} icon={<Focus className="size-4" />} onClick={onReset} />
                <Tooltip title={t("canvas.zoom")}>
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="w-24"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label={t("canvas.zoom")}
                    />
                </Tooltip>
                <span className="w-10 text-right text-xs tabular-nums" style={{ color: theme.node.muted }}>
                    {Math.round(scale * 100)}%
                </span>
                <ZoomButton label={t("canvas.shortcuts")} active={shortcutsOpen} activeStyle={activeStyle} theme={theme} icon={<HelpCircle className="size-4" />} onClick={() => setShortcutsOpen(true)} />
            </div>

            <div ref={actionDockRef} className="relative flex h-12 items-center gap-1 rounded-2xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <ZoomButton label={t(`canvas.toolbar.${canvasTool}`)} theme={theme} icon={canvasTool === "select" ? <MousePointer2 className="size-4" /> : <Hand className="size-4" />} onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")} />
                <ZoomButton label={t("canvas.undo")} disabled={!canUndo} theme={theme} icon={<Undo2 className="size-4" />} onClick={onUndo} />
                <ZoomButton label={t("canvas.redo")} disabled={!canRedo} theme={theme} icon={<Redo2 className="size-4" />} onClick={onRedo} />
                <ActionDivider theme={theme} />
                <ZoomButton label={t("canvas.toolbar.appearance")} active={appearanceOpen} activeStyle={activeStyle} theme={theme} icon={<Palette className="size-4" />} onClick={() => setAppearanceOpen((value) => !value)} />
                {selectedCount ? <ZoomButton label={t("canvas.deleteSelected")} danger theme={theme} icon={<Trash2 className="size-4" />} onClick={onDelete} /> : null}
                <ZoomButton label={t("canvas.toolbar.clear")} danger theme={theme} icon={<Eraser className="size-4" />} onClick={onClear} />

                {appearanceOpen ? (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[288px] rounded-2xl border p-2.5 shadow-xl backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}>
                        <div className="px-1 pb-2 text-sm font-medium opacity-65">{t("canvas.toolbar.appearance")}</div>
                        <div className="px-1 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.themeMode")}</div>
                        <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                            <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={setTheme}>
                                <Sun className="size-4" />
                                {t("canvas.toolbar.light")}
                            </CanvasThemeButton>
                            <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={setTheme}>
                                <Moon className="size-4" />
                                {t("canvas.toolbar.dark")}
                            </CanvasThemeButton>
                            <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark-gray" onThemeChange={setTheme}>
                                <Circle className="size-4" />
                                {t("canvas.toolbar.darkGray")}
                            </CanvasThemeButton>
                        </div>
                        <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.gridStyle")}</div>
                        <Segmented
                            className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8"
                            value={backgroundMode}
                            onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                            options={[
                                { value: "dots", label: <span className="inline-flex items-center gap-1.5"><CircleDot className="size-4" />{t("canvas.toolbar.dots")}</span> },
                                { value: "lines", label: <span className="inline-flex items-center gap-1.5"><Grid2x2 className="size-4" />{t("canvas.toolbar.lines")}</span> },
                                { value: "blank", label: <span className="inline-flex items-center gap-1.5"><Square className="size-4" />{t("canvas.toolbar.blank")}</span> },
                            ]}
                        />
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65"><Info className="size-3.5" />{t("canvas.toolbar.imageInfo")}</span>
                            <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
                        </div>
                    </div>
                ) : null}
            </div>

            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut label={`Ctrl / Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.zoom")} />
                    <Shortcut label={t("canvas.shortcut.drag")} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut label="Ctrl / Cmd + C / V" value={t("canvas.shortcut.copyPasteNodes")} />
                    <Shortcut label="Ctrl / Cmd + G" value={t("canvas.shortcut.group")} />
                    <Shortcut label="Ctrl / Cmd + Shift + G" value={t("canvas.shortcut.ungroup")} />
                    <Shortcut label="Delete / Backspace" value={t("canvas.shortcut.delete")} />
                </div>
            </Modal>
        </div>
    );
}

function ZoomButton({ label, icon, theme, onClick, active = false, activeStyle, disabled = false, danger = false }: { label: string; icon: ReactNode; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void; active?: boolean; activeStyle?: CSSProperties; disabled?: boolean; danger?: boolean }) {
    return (
        <Tooltip title={label}>
            <Button
                type="text"
                className="!h-8 !w-8 !min-w-8 !p-0"
                disabled={disabled}
                style={active ? activeStyle : { color: danger ? "#f87171" : theme.toolbar.item }}
                icon={icon}
                onClick={onClick}
                aria-label={label}
            />
        </Tooltip>
    );
}

function ActionDivider({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return <span className="mx-1 h-5 w-px" style={{ background: theme.toolbar.border }} />;
}

function CanvasThemeButton({ colorTheme, targetTheme, onThemeChange, children }: { colorTheme: CanvasColorTheme; targetTheme: CanvasColorTheme; onThemeChange: (theme: CanvasColorTheme) => void; children: ReactNode }) {
    const theme = canvasThemes[colorTheme];
    const active = colorTheme === targetTheme;
    const activeStyle = colorTheme === "light" ? { background: "#111111", color: "#ffffff" } : { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const { t } = useTranslation();
    const label = targetTheme === "light" ? t("canvas.toolbar.light") : targetTheme === "dark" ? t("canvas.toolbar.dark") : t("canvas.toolbar.darkGray");

    return (
        <AnimatedThemeToggler
            theme={colorTheme}
            targetTheme={targetTheme}
            onThemeChange={onThemeChange}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition"
            style={active ? activeStyle : { color: theme.toolbar.item }}
            aria-label={label}
            title={label}
        >
            {children}
        </AnimatedThemeToggler>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
