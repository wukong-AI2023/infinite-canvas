import { useEffect } from "react";
import type { ReactNode } from "react";
import { BetweenHorizontalStart, ClipboardCopy, Copy, GalleryHorizontalEnd, GalleryHorizontal, Group, Trash2, Ungroup } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "@/types/canvas";
import type { VideoFramePosition } from "@/lib/canvas/canvas-video-frame";

export function CanvasNodeContextMenu({
    menu,
    canCaptureVideoFrame,
    canGroup,
    canUngroup,
    canUndo,
    canRedo,
    onClose,
    onCaptureVideoFrame,
    onUpload,
    onUndo,
    onRedo,
    onCopy,
    onDuplicate,
    onPaste,
    onGroup,
    onUngroup,
    onDelete,
}: {
    menu: ContextMenuState;
    canCaptureVideoFrame: boolean;
    canGroup?: boolean;
    canUngroup?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    onClose: () => void;
    onCaptureVideoFrame: (position: VideoFramePosition) => void;
    onUpload?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCopy?: () => void;
    onDuplicate: () => void;
    onPaste?: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-52 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {canCaptureVideoFrame ? (
                <>
                    <MenuButton icon={<BetweenHorizontalStart className="size-4" />} label={t("canvas.videoFrames.first")} onClick={() => onCaptureVideoFrame("first")} />
                    <MenuButton icon={<GalleryHorizontalEnd className="size-4" />} label={t("canvas.videoFrames.last")} onClick={() => onCaptureVideoFrame("last")} />
                    <MenuButton icon={<GalleryHorizontal className="size-4" />} label={t("canvas.videoFrames.current")} onClick={() => onCaptureVideoFrame("current")} />
                    <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                </>
            ) : null}
            {menu.type === "canvas" ? (
                <>
                    <MenuButton label={t("canvas.controls.upload")} onClick={onUpload} />
                    <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                    <MenuButton label={t("canvas.undo")} shortcut="CtrlZ" disabled={!canUndo} onClick={onUndo} />
                    <MenuButton label={t("canvas.redo")} shortcut="ShiftCtrlZ" disabled={!canRedo} onClick={onRedo} />
                    <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                    <MenuButton label={t("canvas.controls.paste")} shortcut="CtrlV" onClick={onPaste} />
                </>
            ) : null}
            {menu.type === "node" && canGroup ? <MenuButton icon={<Group className="size-4" />} label={t("canvas.nodeToolbar.group")} onClick={onGroup} /> : null}
            {menu.type === "node" && canUngroup ? <MenuButton icon={<Ungroup className="size-4" />} label={t("canvas.nodeToolbar.ungroup")} onClick={onUngroup} /> : null}
            {menu.type === "node" ? <MenuButton icon={<ClipboardCopy className="size-4" />} label={t("canvas.node.copyImage")} onClick={onCopy} /> : null}
            {menu.type === "node" ? <MenuButton icon={<Copy className="size-4" />} label={t("canvas.node.createCopy")} onClick={onDuplicate} /> : null}
            {menu.type !== "canvas" ? <MenuButton icon={<Trash2 className="size-4" />} label={t("canvas.controls.delete")} onClick={onDelete} danger /> : null}
        </div>
    );
}

function MenuButton({ icon, label, shortcut, onClick, danger = false, disabled = false }: { icon?: ReactNode; label: string; shortcut?: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" disabled={disabled} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${disabled ? "cursor-default opacity-40" : "hover:opacity-80"}`} style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span className="flex-1">{label}</span>
            {shortcut ? <span className="shrink-0 text-right opacity-50">{shortcut}</span> : null}
        </button>
    );
}
