import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Image } from "antd";
import { FileText, Folder, Image as ImageIcon, Music2, Video } from "lucide-react";

import i18n from "@/i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_REFERENCE_PATTERN, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { isImeComposing, isPlainEnterKey } from "@/lib/keyboard-event";
import { useThemeStore } from "@/stores/use-theme-store";

type AssetMention = { id: string; title: string; previewUrl?: string; storageKey?: string };

type Props = {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    allowImageMentions?: boolean;
    assetMentions?: AssetMention[];
    onPickAsset?: (assetId: string) => CanvasResourceReference | null;
};

type MentionState = { query: string; rect: DOMRect | null };
type Token = { type: "text"; value: string } | { type: "reference"; nodeId: string; source: "node" | "attached" };

export type CanvasPromptChipInputHandle = {
    insertReference: (reference: CanvasResourceReference) => void;
};

// Reference chips serialize to stable node IDs while their thumbnail and visible label follow the current reference order.
export const CanvasPromptChipInput = forwardRef<CanvasPromptChipInputHandle, Props>(function CanvasPromptChipInput({ value, references, onChange, onSubmit, className, style, placeholder, allowImageMentions = true, assetMentions = [], onPickAsset }, ref) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    const caretRangeRef = useRef<Range | null>(null);
    const lastEmittedRef = useRef(value);
    const extraReferencesRef = useRef(new Map<string, CanvasResourceReference>());
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const referenceById = useMemo(() => {
        const map = new Map(activeReferences.map((item) => [item.nodeId, item]));
        extraReferencesRef.current.forEach((item, id) => {
            if (!map.has(id)) map.set(id, item);
        });
        return map;
    }, [activeReferences]);
    const tokens = useMemo(() => parseTokens(value), [value]);
    const connectedCandidates = useMemo(() => {
        const items = allowImageMentions ? activeReferences : activeReferences.filter((item) => item.kind !== "image");
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [activeReferences, allowImageMentions, mention]);
    const assetCandidates = useMemo(() => {
        if (!mention || !allowImageMentions || !onPickAsset) return [];
        const query = mention.query.trim().toLowerCase();
        const items = query ? assetMentions.filter((item) => item.title.toLowerCase().includes(query)) : assetMentions;
        return items.slice(0, 20);
    }, [allowImageMentions, assetMentions, mention, onPickAsset]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || (document.activeElement === editor && value === lastEmittedRef.current)) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") editor.append(document.createTextNode(token.value));
            else {
                const reference = referenceById.get(token.nodeId);
                if (reference) editor.append(createReferenceChip(reference, theme, setImagePreview));
            }
        });
        lastEmittedRef.current = value;
    }, [referenceById, theme, tokens, value]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.querySelectorAll<HTMLElement>("[data-reference-node-id]").forEach((chip) => {
            const reference = referenceById.get(chip.dataset.referenceNodeId || "");
            if (reference) updateReferenceChip(chip, reference);
        });
    }, [referenceById]);

    const emit = (next: string) => {
        lastEmittedRef.current = next;
        onChange(next);
    };
    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };
    const saveCaret = () => {
        const selection = window.getSelection();
        const editor = editorRef.current;
        if (selection?.rangeCount && editor?.contains(selection.getRangeAt(0).commonAncestorContainer)) caretRangeRef.current = selection.getRangeAt(0).cloneRange();
    };
    const syncMention = () => {
        const match = /@([^\s@]*)$/.exec(textBeforeCaret());
        if (!match) return closeMention();
        setMention({ query: match[1] || "", rect: caretRect() });
        setActiveIndex(0);
    };
    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        emit(serializeEditor(editor));
        saveCaret();
        syncMention();
    };
    const insertReference = (reference: CanvasResourceReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const selection = window.getSelection();
        if (caretRangeRef.current && editor.contains(caretRangeRef.current.commonAncestorContainer)) {
            selection?.removeAllRanges();
            selection?.addRange(caretRangeRef.current);
        }
        extraReferencesRef.current.set(reference.nodeId, reference);
        removeActiveMention();
        const range = selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0) : null;
        const chip = createReferenceChip(reference, theme, setImagePreview);
        const space = document.createTextNode(" ");
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
            caretRangeRef.current = range.cloneRange();
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
            saveCaret();
        }
        closeMention();
        emit(serializeEditor(editor));
    };

    useImperativeHandle(ref, () => ({ insertReference }));

    return (
        <div className="relative h-full w-full">
            {!value.trim() && placeholder ? <div className="pointer-events-none absolute left-3 top-2 text-sm leading-5" style={{ color: theme.node.placeholder }}>{placeholder}</div> : null}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                className={`${className || ""} overflow-y-auto whitespace-pre-wrap break-words outline-none select-text`}
                style={{ ...style, cursor: "text" }}
                onContextMenu={(event) => event.stopPropagation()}
                onInput={() => { if (!composingRef.current) syncFromEditor(); }}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={() => { composingRef.current = false; syncFromEditor(); }}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    if (isImeComposing(event)) return;
                    if (mention && (connectedCandidates.length || assetCandidates.length)) {
                        const total = connectedCandidates.length + assetCandidates.length;
                        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % total); return; }
                        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => (index - 1 + total) % total); return; }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            const index = Math.min(activeIndex, total - 1);
                            if (index < connectedCandidates.length) insertReference(connectedCandidates[index]);
                            else {
                                const asset = assetCandidates[index - connectedCandidates.length];
                                const next = asset ? onPickAsset?.(asset.id) : null;
                                if (next) insertReference(next);
                            }
                            return;
                        }
                        if (event.key === "Escape") { event.preventDefault(); closeMention(); return; }
                    }
                    if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) { event.preventDefault(); requestAnimationFrame(syncFromEditor); return; }
                    if (isPlainEnterKey(event) && onSubmit) { event.preventDefault(); onSubmit(); return; }
                    requestAnimationFrame(() => { saveCaret(); syncMention(); });
                }}
                onKeyUp={saveCaret}
                onMouseUp={saveCaret}
                onBlur={() => { saveCaret(); window.setTimeout(closeMention, 120); }}
            />
            {mention && (connectedCandidates.length || assetCandidates.length) ? (
                <MentionMenu
                    rect={mention.rect}
                    connected={connectedCandidates}
                    assets={assetCandidates}
                    activeIndex={Math.min(activeIndex, connectedCandidates.length + assetCandidates.length - 1)}
                    theme={theme}
                    onSelectConnected={insertReference}
                    onSelectAsset={(assetId) => {
                        const next = onPickAsset?.(assetId);
                        if (next) insertReference(next);
                    }}
                />
            ) : null}
            {imagePreview ? <Image src={imagePreview} alt={i18n.t("canvas.composer.imagePreview")} style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
});

function MentionMenu({ rect, connected, assets, activeIndex, theme, onSelectConnected, onSelectAsset }: { rect: DOMRect | null; connected: CanvasResourceReference[]; assets: AssetMention[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelectConnected: (reference: CanvasResourceReference) => void; onSelectAsset: (assetId: string) => void }) {
    const selectedRef = useRef(false);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => { activeItemRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIndex, assets, connected]);
    const pick = (action: () => void) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        action();
    };
    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();
    const menuWidth = 256;
    const maxMenuHeight = 280;
    const gap = 6;
    const anchor = rect || new DOMRect(16, 16, 0, 0);
    const left = clamp(anchor.left, 8, window.innerWidth - menuWidth - 8);
    const showAbove = anchor.bottom + gap + maxMenuHeight > window.innerHeight && anchor.top - gap - maxMenuHeight >= 0;
    const top = showAbove ? anchor.top - gap - maxMenuHeight : anchor.bottom + gap;
    return createPortal(
        <div data-canvas-resource-mention-menu="true" className="fixed z-[1100] max-h-72 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md" style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onClick={(event) => event.stopPropagation()}>
            {connected.length ? <div className="px-2 py-1 text-[11px] font-medium opacity-55">{i18n.t("canvas.references.connected")}</div> : null}
            {connected.map((reference, index) => (
                <button key={reference.id} ref={index === activeIndex ? activeItemRef : undefined} type="button" className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition" style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); pick(() => onSelectConnected(reference)); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); pick(() => onSelectConnected(reference)); }}>
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1"><span className="block font-medium">{reference.label}</span><span className="block truncate opacity-65">{reference.text || reference.title}</span></span>
                </button>
            ))}
            {assets.length ? <div className="mt-1 flex items-center gap-1 px-2 py-1 text-[11px] font-medium opacity-55"><Folder className="size-3" />{i18n.t("canvas.references.assets")}</div> : null}
            {assets.map((asset, index) => {
                const itemIndex = connected.length + index;
                return (
                    <button key={asset.id} ref={itemIndex === activeIndex ? activeItemRef : undefined} type="button" className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition" style={{ background: itemIndex === activeIndex ? theme.toolbar.activeBg : "transparent", color: itemIndex === activeIndex ? theme.toolbar.activeText : theme.node.text }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); pick(() => onSelectAsset(asset.id)); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); pick(() => onSelectAsset(asset.id)); }}>
                        {asset.previewUrl ? <img src={asset.previewUrl} alt="" className="size-9 rounded-md object-cover" /> : <span className="grid size-9 place-items-center rounded-md"><ImageIcon className="size-4" /></span>}
                        <span className="min-w-0 flex-1 truncate font-medium">{asset.title}</span>
                    </button>
                );
            })}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    const preview = reference.kind === "image" ? (reference.previewUrl || previewUrlFor(reference.storageKey)) : "";
    if (preview) return <img src={preview} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return <span className="grid size-9 shrink-0 place-items-center rounded-md"><Icon className="size-4" /></span>;
}

function createReferenceChip(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.referenceNodeId = reference.nodeId;
    wrapper.dataset.referenceKind = reference.source === "attached" ? "asset" : "node";
    wrapper.className = "mx-px inline-flex h-7 max-w-44 items-center gap-1 overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
    Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
    const preview = reference.kind === "image" ? (reference.previewUrl || previewUrlFor(reference.storageKey)) : "";
    if (preview) {
        const image = document.createElement("img");
        image.src = preview;
        image.alt = reference.title;
        image.className = "size-5 shrink-0 rounded object-cover";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onImagePreview(preview); });
    }
    const text = document.createElement("span");
    text.dataset.referenceLabel = "true";
    text.className = "block truncate";
    text.textContent = reference.label;
    wrapper.appendChild(text);
    wrapper.title = reference.text || reference.title;
    return wrapper;
}

function updateReferenceChip(chip: HTMLElement, reference: CanvasResourceReference) {
    const label = chip.querySelector<HTMLElement>("[data-reference-label]");
    if (label) label.textContent = reference.label;
    chip.title = reference.text || reference.title;
    const preview = reference.kind === "image" ? (reference.previewUrl || previewUrlFor(reference.storageKey)) : "";
    if (!preview) return;
    let image = chip.querySelector("img");
    if (!image) {
        image = document.createElement("img");
        image.className = "size-5 shrink-0 rounded object-cover";
        image.alt = reference.title;
        chip.insertBefore(image, chip.firstChild);
    }
    image.src = preview;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/\uFEFF/g, "");
}
function serializeNodes(nodes: NodeListOf<ChildNode>) {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const nodeId = node.dataset.referenceNodeId;
        if (nodeId) result += `@[${node.dataset.referenceKind === "asset" ? "asset" : "node"}:${nodeId}]`;
        else if (node.tagName === "BR") result += "\n";
        else result += serializeNodes(node.childNodes);
    });
    return result;
}
function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const match = /@([^\s@]*)$/.exec(textBeforeCaret());
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}
function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}
function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}
function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.referenceNodeId ? current : null;
}
function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}
function caretRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height || rect.left || rect.top) return rect;
    return closestEditor(range.startContainer)?.getBoundingClientRect() || null;
}
function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}
function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}
function parseTokens(value: string): Token[] {
    const tokens: Token[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(CANVAS_REFERENCE_PATTERN)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", nodeId: match[2], source: match[1] === "asset" ? "attached" : "node" });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}
function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
