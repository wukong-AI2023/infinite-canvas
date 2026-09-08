import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

import { isDarkTheme, type CanvasColorTheme } from "@/lib/canvas-theme";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(23, 23, 23, 0.06)",
        itemSelectedBg: "rgba(23, 23, 23, 0.1)",
        itemSelectedHoverBg: "rgba(23, 23, 23, 0.14)",
        itemText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        elevatedBg: "#1c1917",
        itemHoverBg: "rgba(250, 250, 249, 0.08)",
        itemSelectedBg: "rgba(250, 250, 249, 0.12)",
        itemSelectedHoverBg: "rgba(250, 250, 249, 0.16)",
        itemText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
    "dark-gray": {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        elevatedBg: "#262626",
        itemHoverBg: "rgba(250, 250, 250, 0.08)",
        itemSelectedBg: "rgba(250, 250, 250, 0.12)",
        itemSelectedHoverBg: "rgba(250, 250, 250, 0.16)",
        itemText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

export function getAntThemeConfig(theme: CanvasColorTheme): ThemeConfig {
    const dark = isDarkTheme(theme);
    const color = theme === "dark-gray" ? neutral["dark-gray"] : dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: theme === "light" ? "infinite-canvas-light" : theme === "dark-gray" ? "infinite-canvas-dark-gray" : "infinite-canvas-dark" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: dark ? color.elevatedBg : neutral.dark.elevatedBg,
                darkItemHoverBg: dark ? color.itemHoverBg : neutral.dark.itemHoverBg,
                darkItemSelectedBg: dark ? color.itemSelectedBg : neutral.dark.itemSelectedBg,
                darkItemSelectedColor: dark ? color.itemText : neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
