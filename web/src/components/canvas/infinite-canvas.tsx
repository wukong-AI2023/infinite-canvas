import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from "@/constant/canvas";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "@/types/canvas";

type ViewportPhase = "live" | "end";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform, phase?: ViewportPhase) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

const OVERLAY_SELECTOR = "[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown";

export function isCanvasTextContextTarget(target: EventTarget | null) {
    const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    return Boolean(element?.closest("input,textarea,[contenteditable='true'],[data-canvas-text-context]"));
}

export function readCanvasScale(el: Element | null): number {
    const world = el?.closest("[data-canvas-world]");
    const raw = world instanceof HTMLElement ? world.style.getPropertyValue("--canvas-k") || getComputedStyle(world).getPropertyValue("--canvas-k") : "";
    const k = Number.parseFloat(raw);
    return Number.isFinite(k) && k > 0 ? k : 1;
}

function fadeDotColor(color: string, fade: number) {
    if (fade >= 1) return color;
    if (fade <= 0) return "transparent";
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    if (hex) {
        const n = Number.parseInt(hex[1], 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${fade})`;
    }
    const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!rgba) return color;
    const parts = rgba[1].split(",").map((part) => part.trim());
    const alpha = parts[3] === undefined ? fade : Number(parts[3]) * fade;
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

export function InfiniteCanvas({ containerRef, viewport, tool, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onCanvasDoubleClick, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const worldRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);
    const liveRef = useRef(viewport);
    const gesturingRef = useRef(false);
    const backgroundModeRef = useRef(backgroundMode);
    const colorThemeRef = useRef(colorTheme);
    const themeRef = useRef(theme);
    const onViewportChangeRef = useRef(onViewportChange);
    const frameRef = useRef<number | null>(null);
    const wheelEndTimerRef = useRef<number | null>(null);
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
        startedOnBackground: false,
    });
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isControlPressed, setIsControlPressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    backgroundModeRef.current = backgroundMode;
    colorThemeRef.current = colorTheme;
    themeRef.current = theme;
    onViewportChangeRef.current = onViewportChange;

    const applyVisual = (next: ViewportTransform, withWillChange: boolean) => {
        const world = worldRef.current;
        const grid = gridRef.current;
        if (world) {
            world.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.k})`;
            world.style.setProperty("--canvas-k", String(next.k));
            world.style.willChange = withWillChange ? "transform" : "auto";
        }
        if (!grid) return;
        const mode = backgroundModeRef.current;
        if (mode === "blank") {
            grid.style.display = "none";
            return;
        }
        const currentTheme = themeRef.current;
        const gridSize = mode === "dots" ? 16 * next.k : 48 * next.k;
        const dotSize = Math.max(0.5, next.k * 0.5);
        const fade = mode === "dots" ? Math.min(1, Math.max(0, (next.k - CANVAS_MIN_ZOOM) / (0.5 - CANVAS_MIN_ZOOM))) : 1;
        grid.style.display = "";
        grid.style.opacity = mode === "dots" && colorThemeRef.current === "dark-gray" ? "1" : "0.4";
        if (mode === "dots") {
            grid.style.setProperty("--canvas-dot", fadeDotColor(currentTheme.canvas.dot, fade));
            grid.style.setProperty("--canvas-dot-size", `${dotSize}px`);
            grid.style.backgroundImage = "radial-gradient(circle, var(--canvas-dot) var(--canvas-dot-size), transparent calc(var(--canvas-dot-size) + 0.2px))";
        } else {
            grid.style.backgroundImage = `linear-gradient(${currentTheme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${currentTheme.canvas.line} 1px, transparent 1px)`;
        }
        grid.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        grid.style.backgroundPosition = `${next.x % gridSize}px ${next.y % gridSize}px`;
    };

    const scheduleVisual = (next: ViewportTransform) => {
        liveRef.current = next;
        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            applyVisual(liveRef.current, gesturingRef.current);
            if (gesturingRef.current) onViewportChangeRef.current(liveRef.current, "live");
        });
    };

    const beginGesture = () => {
        gesturingRef.current = true;
        if (worldRef.current) worldRef.current.style.willChange = "transform";
    };

    const endGesture = () => {
        if (wheelEndTimerRef.current) {
            window.clearTimeout(wheelEndTimerRef.current);
            wheelEndTimerRef.current = null;
        }
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        applyVisual(liveRef.current, false);
        onViewportChangeRef.current(liveRef.current, "end");
        gesturingRef.current = false;
    };

    useLayoutEffect(() => {
        if (gesturingRef.current) return;
        liveRef.current = viewport;
        applyVisual(viewport, false);
    }, [viewport, backgroundMode, colorTheme, theme]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (wheelEndTimerRef.current) window.clearTimeout(wheelEndTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control") setIsControlPressed(true);
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']")) return;
            event.preventDefault();
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                const target = event.target instanceof Element ? event.target : null;
                if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']"))) event.preventDefault();
                setIsSpacePressed(false);
            }
            if (event.key === "Control") setIsControlPressed(false);
        };

        const handleBlur = () => {
            setIsSpacePressed(false);
            setIsControlPressed(false);
            if (panState.current.isPanning) {
                panState.current.isPanning = false;
                setIsPanning(false);
                document.body.style.cursor = "";
                if (gesturingRef.current) endGesture();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const temporaryTool = event.ctrlKey || isSpacePressed;
        const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
        const shouldPan = event.button === 1 || (event.button === 0 && activeTool === "pan" && isBackgroundClick);

        if (shouldPan) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            beginGesture();
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: liveRef.current.x,
                initialY: liveRef.current.y,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
            };
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-node-id],[data-connection-id]")) return;
        onCanvasDoubleClick?.(event);
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.current.hasMoved = true;

            scheduleVisual({
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: liveRef.current.k,
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;
            if (!panState.current.hasMoved && panState.current.startedOnBackground) onCanvasDeselect?.();
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
            endGesture();
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.cursor = "";
        };
    }, [onCanvasDeselect]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest(OVERLAY_SELECTOR)) return;
            event.preventDefault();

            const current = liveRef.current;
            const factor = Math.pow(1.1, -event.deltaY / 100);
            const newScale = Math.min(Math.max(current.k * factor, CANVAS_MIN_ZOOM), CANVAS_MAX_ZOOM);
            const rect = container.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - current.x) / current.k;
            const worldY = (mouseY - current.y) / current.k;
            const next = {
                x: mouseX - worldX * newScale,
                y: mouseY - worldY * newScale,
                k: newScale,
            };

            beginGesture();
            liveRef.current = next;
            applyVisual(next, true);
            onViewportChangeRef.current(next, "live");
            if (wheelEndTimerRef.current) window.clearTimeout(wheelEndTimerRef.current);
            wheelEndTimerRef.current = window.setTimeout(() => {
                wheelEndTimerRef.current = null;
                if (!panState.current.isPanning) endGesture();
            }, 100);
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => container.removeEventListener("wheel", handleWheel);
    }, [containerRef]);

    const temporaryTool = isControlPressed || isSpacePressed;
    const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
    const cursor = isPanning ? "grabbing" : activeTool === "pan" ? "grab" : undefined;

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-hidden"
            style={{ background: theme.canvas.background, cursor }}
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <div ref={gridRef} className="pointer-events-none absolute inset-0" />
            <div ref={worldRef} data-canvas-world className="absolute origin-top-left">
                {children}
            </div>
        </div>
    );
}
