export type CanvasColorTheme = "light" | "dark" | "dark-gray";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export function isDarkTheme(theme: CanvasColorTheme) {
    return theme !== "light";
}

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#7a7a7a",
            selectionFill: "rgba(28,25,23,.06)",
            groupFill: "rgba(28,25,23,.054)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#7a7a7a",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#181715",
            dot: "rgba(245,245,244,.24)",
            line: "rgba(245,245,244,.10)",
            selectionStroke: "#7a7a7a",
            selectionFill: "rgba(250,250,249,.10)",
            groupFill: "rgba(250,250,249,.09)",
        },
        node: {
            label: "#d6d3d1",
            fill: "#292524",
            panel: "#1f1d1a",
            stroke: "#44403c",
            activeStroke: "#7a7a7a",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "rgba(31,29,26,.96)",
            border: "#44403c",
            item: "#d6d3d1",
            itemHover: "#292524",
            activeBg: "#3a3631",
            activeText: "#f5f5f4",
        },
    },
    "dark-gray": {
        canvas: {
            background: "#0a0a0a",
            dot: "#464646",
            line: "rgba(119,119,119,.14)",
            selectionStroke: "#7a7a7a",
            selectionFill: "rgba(255,255,255,.12)",
            groupFill: "rgba(255,255,255,.108)",
        },
        node: {
            label: "#f5f5f5",
            fill: "#1f1f1f",
            panel: "#1a1a1a",
            stroke: "#313131",
            activeStroke: "#7a7a7a",
            placeholder: "#7a7a7a",
            text: "#f5f5f5",
            muted: "#9c9c9c",
            faint: "#7a7a7a",
        },
        toolbar: {
            panel: "#1c1c1c",
            border: "#313131",
            item: "#f5f5f5",
            itemHover: "#2a2a2a",
            activeBg: "#2d2d2d",
            activeText: "#f5f5f5",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
