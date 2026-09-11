import i18n from "@/i18n";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { getNodeSpec as getRegistryNodeSpec } from "@/lib/canvas/node-registry";
import { nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

const NODE_SHORT_SIDE = 330;
const NODE_SQUARE = { width: NODE_SHORT_SIDE, height: NODE_SHORT_SIDE };
const NODE_WIDE = nodeSizeFromRatio("16:9", NODE_SHORT_SIDE, NODE_SHORT_SIDE) || NODE_SQUARE;
export const CONFIG_NODE_LAYOUT_SIZE = { width: 340, height: 240 };
const NODE_CONFIG = nodeSizeFromRatio(`${CONFIG_NODE_LAYOUT_SIZE.width}:${CONFIG_NODE_LAYOUT_SIZE.height}`, NODE_SHORT_SIDE, NODE_SHORT_SIDE) || { width: Math.round(NODE_SHORT_SIDE * CONFIG_NODE_LAYOUT_SIZE.width / CONFIG_NODE_LAYOUT_SIZE.height), height: NODE_SHORT_SIDE };

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: NODE_SQUARE.width, height: NODE_SQUARE.height, get title() { return i18n.t("canvas.nodeTypes.image"); } },
    [CanvasNodeType.Text]: { width: NODE_SQUARE.width, height: NODE_SQUARE.height, get title() { return i18n.t("canvas.nodeTypes.text"); } },
    [CanvasNodeType.Config]: { width: NODE_CONFIG.width, height: NODE_CONFIG.height, get title() { return i18n.t("canvas.nodeTypes.config"); } },
    [CanvasNodeType.Video]: { width: NODE_WIDE.width, height: NODE_WIDE.height, get title() { return i18n.t("canvas.nodeTypes.video"); } },
    [CanvasNodeType.Audio]: { width: NODE_WIDE.width, height: NODE_WIDE.height, get title() { return i18n.t("canvas.nodeTypes.audio"); } },
    [CanvasNodeType.Group]: { width: 760, height: 480, get title() { return i18n.t("canvas.nodeTypes.group"); } },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Image].width, height: NODE_DEFAULT_SIZE[CanvasNodeType.Image].height, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Image].title; },
        metadata: { content: "", status: "idle", size: "auto" },
    },
    [CanvasNodeType.Text]: {
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Text].width, height: NODE_DEFAULT_SIZE[CanvasNodeType.Text].height, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Text].title; },
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Config]: {
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Config].width, height: NODE_DEFAULT_SIZE[CanvasNodeType.Config].height, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Config].title; },
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, height: NODE_DEFAULT_SIZE[CanvasNodeType.Video].height, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Video].title; },
        metadata: { content: "", status: "idle", size: "auto" },
    },
    [CanvasNodeType.Audio]: {
        width: NODE_DEFAULT_SIZE[CanvasNodeType.Audio].width, height: NODE_DEFAULT_SIZE[CanvasNodeType.Audio].height, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Audio].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Group]: {
        width: 760, height: 480, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Group].title; },
        metadata: { status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

// Return built-in specs directly and resolve plugin types from the registry.
export function getNodeSpec(type: string) {
    if ((Object.values(CanvasNodeType) as string[]).includes(type)) return NODE_SPECS[type as CanvasNodeType];
    const spec = getRegistryNodeSpec(type);
    return { width: spec.width, height: spec.height, title: spec.title, metadata: spec.metadata };
}
