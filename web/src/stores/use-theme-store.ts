import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CanvasColorTheme } from "@/lib/canvas-theme";

export type ThemeName = CanvasColorTheme;
export type DarkThemeName = Exclude<ThemeName, "light">;

type ThemeStore = {
    theme: ThemeName;
    lastDarkTheme: DarkThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            lastDarkTheme: "dark",
            setTheme: (theme) =>
                set((state) => ({
                    theme,
                    lastDarkTheme: theme === "light" ? state.lastDarkTheme : theme,
                })),
        }),
        { name: "infinite-canvas:theme_store" },
    ),
);
