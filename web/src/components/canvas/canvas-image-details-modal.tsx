import { useEffect, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useImageEditorViewport } from "@/components/canvas/use-image-editor-viewport";
import { canvasThemes } from "@/lib/canvas-theme";
import { readImageMeta } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasImageDetailsModal({
    open,
    src,
    alt,
    metaText,
    naturalWidth,
    naturalHeight,
    onClose,
}: {
    open: boolean;
    src?: string;
    alt: string;
    metaText?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const viewport = useImageEditorViewport(image, open, { leftDragPan: true });
    const zoomed = viewport.zoom > 1.001;

    useEffect(() => {
        if (!open || !src) {
            setImage(null);
            return;
        }
        if (naturalWidth && naturalHeight) {
            setImage({ width: naturalWidth, height: naturalHeight });
            return;
        }
        void readImageMeta(src).then(setImage);
    }, [naturalHeight, naturalWidth, open, src]);

    return (
        <Modal
            title={
                <div className="flex min-w-0 items-baseline gap-3 pr-6">
                    <span>{t("canvas.projectPage.imageDetails")}</span>
                    {metaText ? (
                        <span className="truncate text-xs font-normal tabular-nums" style={{ color: theme.node.muted }}>
                            {metaText}
                        </span>
                    ) : null}
                </div>
            }
            open={open}
            centered={false}
            onCancel={onClose}
            footer={null}
            width="100vw"
            wrapClassName="[&_.ant-modal]:!inset-0 [&_.ant-modal]:!top-0 [&_.ant-modal]:!m-0 [&_.ant-modal]:!max-w-none [&_.ant-modal]:!h-dvh [&_.ant-modal]:!w-full [&_.ant-modal]:!p-0 [&_.ant-modal-container]:!h-dvh [&_.ant-modal-container]:!p-0 [&_.ant-modal-content]:!flex [&_.ant-modal-content]:!h-dvh [&_.ant-modal-content]:!max-h-dvh [&_.ant-modal-content]:!flex-col [&_.ant-modal-content]:!rounded-none [&_.ant-modal-content]:!overflow-hidden [&_.ant-modal-body]:!flex [&_.ant-modal-body]:!min-h-0 [&_.ant-modal-body]:!flex-1 [&_.ant-modal-body]:!overflow-hidden [&_.ant-modal-body]:!p-0"
            styles={{
                wrapper: { overflow: "hidden" },
                container: { height: "100dvh", maxHeight: "100dvh", margin: 0, padding: 0, borderRadius: 0, overflow: "hidden", display: "flex", flexDirection: "column" },
                body: { flex: 1, minHeight: 0, padding: 0, overflow: "hidden", display: "flex" },
            }}
            style={{ top: 0, margin: 0, paddingBottom: 0, maxWidth: "100vw" }}
        >
            <div
                ref={viewport.viewportRef}
                {...viewport.panHandlers}
                className={`relative min-h-0 w-full flex-1 ${viewport.scrollClassName} ${viewport.isPanning ? "cursor-grabbing" : zoomed ? "cursor-grab" : ""}`}
                onClick={(event) => {
                    if (viewport.consumeClickSuppression()) return;
                    if (zoomed) return;
                    if (event.target instanceof Element && event.target.closest("img")) return;
                    onClose();
                }}
            >
                {src ? (
                    <div className="relative" style={viewport.contentStyle}>
                        <div ref={viewport.stageRef} className="absolute select-none" style={viewport.stageStyle}>
                            <div className="absolute left-0 top-0" style={viewport.mediaStyle}>
                                <img src={src} alt={alt} className="block h-full w-full object-contain" draggable={false} />
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
