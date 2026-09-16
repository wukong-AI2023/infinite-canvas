import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Scissors } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

type NodeBox = { position: Position; width: number; height: number };
type Bezier = { startX: number; startY: number; x1: number; y1: number; x2: number; y2: number; endX: number; endY: number };

function connectionBezier(from: NodeBox, to: NodeBox): Bezier {
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    return { startX, startY, x1: startX + curvature, y1: startY, x2: endX - curvature, y2: endY, endX, endY };
}

function bezierPoint(curve: Bezier, t: number): Position {
    const u = 1 - t;
    return {
        x: u * u * u * curve.startX + 3 * u * u * t * curve.x1 + 3 * u * t * t * curve.x2 + t * t * t * curve.endX,
        y: u * u * u * curve.startY + 3 * u * u * t * curve.y1 + 3 * u * t * t * curve.y2 + t * t * t * curve.endY,
    };
}

export function connectionPathD(from: NodeBox, to: NodeBox) {
    const curve = connectionBezier(from, to);
    return `M ${curve.startX} ${curve.startY} C ${curve.x1} ${curve.y1}, ${curve.x2} ${curve.y2}, ${curve.endX} ${curve.endY}`;
}

export function connectionIntersectsRect(from: NodeBox, to: NodeBox, rect: { x: number; y: number; width: number; height: number }) {
    const curve = connectionBezier(from, to);
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    for (let i = 0; i <= 24; i++) {
        const point = bezierPoint(curve, i / 24);
        if (point.x >= rect.x && point.x <= right && point.y >= rect.y && point.y <= bottom) return true;
    }
    return false;
}

export function closestPointOnConnection(from: NodeBox, to: NodeBox, point: Position) {
    const curve = connectionBezier(from, to);
    let best = bezierPoint(curve, 0);
    let bestDist = Infinity;
    for (let i = 0; i <= 32; i++) {
        const candidate = bezierPoint(curve, i / 32);
        const dist = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
        if (dist < bestDist) {
            best = candidate;
            bestDist = dist;
        }
    }
    return best;
}

export function svgEventPoint(event: ReactMouseEvent<SVGElement>): Position | null {
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const world = pt.matrixTransform(ctm.inverse());
    return { x: world.x, y: world.y };
}

export function connectionLayerBounds(nodes: NodeBox[], extras: Position[] = [], pad = 240) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x: number, y: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    nodes.forEach((node) => {
        add(node.position.x, node.position.y);
        add(node.position.x + node.width, node.position.y + node.height);
    });
    extras.forEach((point) => add(point.x, point.y));
    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1, height: 1 };
    return { x: minX - pad, y: minY - pad, width: Math.max(1, maxX - minX + pad * 2), height: Math.max(1, maxY - minY + pad * 2) };
}

export function applyConnectionLayerBounds(layer: SVGSVGElement | null, bounds: { x: number; y: number; width: number; height: number }) {
    if (!layer) return;
    layer.style.left = `${bounds.x}px`;
    layer.style.top = `${bounds.y}px`;
    layer.style.width = `${bounds.width}px`;
    layer.style.height = `${bounds.height}px`;
    layer.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
}

export function ConnectionPath({
    connection,
    from,
    to,
    active,
    selected,
    scale = 1,
    onSelect,
    onCut,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    selected?: boolean;
    scale?: number;
    onSelect: () => void;
    onCut?: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [cutPoint, setCutPoint] = useState<Position | null>(null);
    const pathD = connectionPathD(from, to);
    const highlight = selected || active;
    const stroke = selected ? theme.canvas.connectionSelected : active ? theme.node.activeStroke : theme.node.muted;
    const buttonScale = 1 / Math.max(scale, 0.01);

    const updateCutPoint = (event: ReactMouseEvent<SVGPathElement>) => {
        const cursor = svgEventPoint(event);
        if (!cursor) return;
        setCutPoint(closestPointOnConnection(from, to, cursor));
    };

    return (
        <g onMouseLeave={() => setCutPoint(null)}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseMove={updateCutPoint}
                onMouseEnter={updateCutPoint}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke={stroke}
                strokeWidth={highlight ? 3 : 2}
                strokeOpacity={highlight ? 1 : 0.82}
                fill="none"
                style={{ filter: highlight ? `drop-shadow(0 0 8px ${stroke}66)` : undefined, pointerEvents: "none" }}
            />
            {cutPoint && onCut ? (
                <g
                    data-connection-id={connection.id}
                    transform={`translate(${cutPoint.x} ${cutPoint.y}) scale(${buttonScale})`}
                    style={{ cursor: "pointer", pointerEvents: "auto" }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onCut();
                    }}
                >
                    <title>{t("canvas.connection.cut")}</title>
                    <circle r="14" fill={theme.canvas.background} stroke={theme.node.stroke} />
                    <foreignObject x="-8" y="-8" width="16" height="16" style={{ overflow: "visible", pointerEvents: "none" }}>
                        <div xmlns="http://www.w3.org/1999/xhtml" className="flex h-full w-full items-center justify-center" style={{ color: theme.node.text }}>
                            <Scissors className="size-3.5 -rotate-45" />
                        </div>
                    </foreignObject>
                </g>
            ) : null}
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}
