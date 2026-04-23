import { createSignal, createMemo, createContext, useContext, createEffect, JSX } from "solid-js";
import { themes } from "./themes";

const DEFAULT_THEME_ID = 'aura';
const DEFAULT_VARIANT_ID = 'dark';

interface ThemeContextType {
    themeId: () => string;
    variantId: () => string;
    setThemeId: (id: string) => void;
    setVariantId: (id: string) => void;
    // Derived convenience: "dark" | "light" based on the current variant's isDark flag.
    // Kept for components that only need to know light vs dark (e.g. the code editor).
    theme: () => "dark" | "light";
}

const ThemeContext = createContext<ThemeContextType>();

export const ThemeProvider = (props: { children: JSX.Element }) => {
    const [themeId, setInternalThemeId] = createSignal<string>(
        localStorage.getItem("themeId") || DEFAULT_THEME_ID
    );
    const [variantId, setInternalVariantId] = createSignal<string>(
        localStorage.getItem("variantId") || DEFAULT_VARIANT_ID
    );

    const setThemeId = (id: string) => {
        setInternalThemeId(id);
        localStorage.setItem("themeId", id);

        // If the current variant doesn't exist in the new theme, pick the first available one.
        const newTheme = themes[id];
        if (newTheme && !newTheme.variants[variantId()]) {
            const firstVariant = Object.keys(newTheme.variants)[0];
            setInternalVariantId(firstVariant);
            localStorage.setItem("variantId", firstVariant);
        }
    };

    const setVariantId = (id: string) => {
        setInternalVariantId(id);
        localStorage.setItem("variantId", id);
    };

    const currentVariant = createMemo(() => {
        return themes[themeId()]?.variants[variantId()];
    });

    const theme = createMemo((): "dark" | "light" =>
        currentVariant()?.isDark ? "dark" : "light"
    );

    const applyVariant = () => {
        const variant = currentVariant();
        if (!variant) return;

        const s = variant.colors;
        const root = document.documentElement;

        const mapping: Record<string, string> = {
            "--base": s.base00,
            "--surface": s.base01,
            "--overlay": s.base02,
            "--muted": s.base03,
            "--subtle": s.base04,
            "--text": s.base05,
            "--love": s.base08,
            "--gold": s.base09,
            "--rose": s.base0A,
            "--pine": s.base0B,
            "--foam": s.base0C,
            "--iris": s.base0D,
            "--highlight-low": s.base01,
            "--highlight-med": s.base02,
            "--highlight-high": s.base03,
            "--border-subtle": s.base02,
            "--accent-primary": s.base0D,
        };

        for (const [key, value] of Object.entries(mapping)) {
            root.style.setProperty(key, value);
        }

        root.style.setProperty('color-scheme', variant.isDark ? 'dark' : 'light');
        root.setAttribute("data-theme", variant.isDark ? "dark" : "light");
        root.setAttribute("data-theme-id", themeId());
        root.setAttribute("data-variant-id", variantId());
    };

    createEffect(() => {
        // Track both signals so the effect re-runs when either changes.
        themeId(); variantId();
        applyVariant();
    });

    return (
        <ThemeContext.Provider value={{ themeId, variantId, setThemeId, setVariantId, theme }}>
            {props.children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext)!;
