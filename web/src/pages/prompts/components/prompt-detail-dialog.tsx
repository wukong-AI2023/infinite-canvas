import { useEffect, useRef, useState } from "react";
import { Copy, FileText, X } from "lucide-react";
import { Button, Image, Modal, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCollectButton } from "@/components/prompts/prompt-collect-button";
import { displayPromptTag } from "@/lib/prompt-tag-labels";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

const PREVIEW_Z_INDEX = 2000;
const PREVIEW_CLOSE_CLASS = "prompt-detail-preview-close";

export function PromptDetailDialog({ prompt, onClose, onCopy, showSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; showSaveAsset?: boolean }) {
    const { i18n, t } = useTranslation();
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewItems, setPreviewItems] = useState<string[]>([]);
    const closeDetailAfterPreview = useRef(false);
    const extraRefs = prompt?.referenceImageUrls.filter((url) => url !== prompt.coverUrl).slice(0, 6) ?? [];
    const previewUrls = prompt?.coverUrl ? [prompt.coverUrl, ...extraRefs] : extraRefs;
    const previewGroupUrls = previewItems.length ? previewItems : previewUrls;

    useEffect(() => {
        closeDetailAfterPreview.current = false;
        setPreviewOpen(false);
        setPreviewIndex(0);
        setPreviewItems([]);
    }, [prompt?.id]);

    useEffect(() => {
        if (!previewOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest(`.ant-image-preview-close, .${PREVIEW_CLOSE_CLASS}`)) {
                closeDetailAfterPreview.current = false;
                return;
            }
            if (target.closest(".ant-image-preview-mask")) closeDetailAfterPreview.current = true;
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [previewOpen]);

    const openPreview = (index: number) => {
        setPreviewItems(previewUrls);
        setPreviewIndex(index);
        setPreviewOpen(true);
    };

    const closePreviewOnly = () => {
        closeDetailAfterPreview.current = false;
        setPreviewOpen(false);
    };

    const handleCancel = () => {
        if (previewOpen) {
            closePreviewOnly();
            return;
        }
        onClose();
    };

    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={handleCancel} footer={null} width={720} centered styles={{ body: { height: "calc(85vh - 55px)", overflow: "hidden" } }}>
                {prompt ? (
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="shrink-0 space-y-3 pb-4">
                            {prompt.coverUrl ? <img src={prompt.coverUrl} alt={prompt.title} className="h-48 w-full cursor-pointer rounded-lg object-cover sm:h-56" onClick={() => openPreview(0)} /> : <div className="grid h-48 w-full place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600 sm:h-56"><FileText className="size-9" /></div>}
                            {prompt.referenceImageUrls.length > 1 ? <div className="grid grid-cols-6 gap-2">{extraRefs.map((url, index) => <img key={url} src={url} alt="" className="aspect-square w-full cursor-pointer rounded-md object-cover" loading="lazy" onClick={() => openPreview((prompt.coverUrl ? 1 : 0) + index)} />)}</div> : null}
                        </div>
                        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-y border-stone-200 py-4 pr-2 dark:border-stone-800">
                            <div className="flex flex-wrap gap-1.5">
                                {prompt.tags.map((tag) => (
                                    <Tag key={tag} className="m-0">
                                        {displayPromptTag(tag)}
                                    </Tag>
                                ))}
                            </div>
                            {prompt.description ? <p className="mt-4 text-sm leading-6 text-stone-500 dark:text-stone-400">{prompt.description}</p> : null}
                            {prompt.preview ? <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{prompt.preview}</pre> : null}
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                            {prompt.createdAt || prompt.updatedAt ? <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">{prompt.createdAt ? t("common.created", { date: formatPromptDate(prompt.createdAt, i18n.resolvedLanguage) }) : null}{prompt.createdAt && prompt.updatedAt ? " · " : null}{prompt.updatedAt ? t("common.updated", { date: formatPromptDate(prompt.updatedAt, i18n.resolvedLanguage) }) : null}</div> : null}
                        </div>
                        <div className="shrink-0 pt-4">
                            <Space wrap>
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                    {t("common.copyPrompt")}
                                </Button>
                                {showSaveAsset ? <PromptCollectButton prompt={prompt} /> : null}
                            </Space>
                        </div>
                    </div>
                ) : null}
            </Modal>
            {previewGroupUrls.length ? (
                <Image.PreviewGroup
                    preview={{
                        open: previewOpen,
                        current: previewIndex,
                        zIndex: PREVIEW_Z_INDEX,
                        closeIcon: false,
                        getContainer: () => document.body,
                        onChange: setPreviewIndex,
                        onOpenChange: setPreviewOpen,
                        afterOpenChange: (open) => {
                            if (!open && closeDetailAfterPreview.current) {
                                closeDetailAfterPreview.current = false;
                                setPreviewItems([]);
                                onClose();
                            }
                        },
                        imageRender: (originalNode) => (
                            <div className="relative inline-block max-w-full [&>img]:relative [&>img]:z-0 [&>img]:!max-h-[70vh] [&>img]:!max-w-full">
                                {originalNode}
                                <button
                                    type="button"
                                    className={`${PREVIEW_CLOSE_CLASS} absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80`}
                                    aria-label={t("canvas.createMenu.close")}
                                    onPointerDown={(event) => {
                                        event.stopPropagation();
                                        closeDetailAfterPreview.current = false;
                                    }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        closePreviewOnly();
                                    }}
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        ),
                    }}
                >
                    <div className="hidden">{previewGroupUrls.map((url) => <Image key={url} src={url} alt="" />)}</div>
                </Image.PreviewGroup>
            ) : null}
        </>
    );
}
