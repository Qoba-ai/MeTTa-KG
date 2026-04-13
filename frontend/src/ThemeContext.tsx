import { createSignal, createContext, useContext, createEffect, JSX } from "solid-js";
import { schemes, Base16Scheme } from "./themes";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: () => Theme;
  setTheme: (t: Theme) => void;
  scheme: () => string;
  setScheme: (s: string) => void;
}

const ThemeContext = createContext<ThemeContextType>();

export const ThemeProvider = (props: { children: JSX.Element }) => {
  const [theme, setInternalTheme] = createSignal<Theme>(
    (localStorage.getItem("theme") as Theme) || "dark"
  );
  const [scheme, setInternalScheme] = createSignal<string>(
    localStorage.getItem("scheme") || "rose-pine"
  );

  const setTheme = (t: Theme) => {
    setInternalTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const setScheme = (s: string) => {
    setInternalScheme(s);
    localStorage.setItem("scheme", s);
    document.documentElement.setAttribute("data-scheme", s);
  };

  const applyScheme = (schemeName: string, theme: Theme) => {
    let s = schemes[schemeName];
    if (!s) return;

    // Special case for Rose Pine: switch between dark (base) and light (dawn)
    if (schemeName === 'rose-pine') {
      if (theme === 'light') {
        // Mapping Rose Pine Dawn to Base16-ish slots
        s = {
          ...s,
          base00: '#faf4ed', // base
          base01: '#fffaf3', // surface
          base02: '#f2e9e1', // overlay
          base03: '#9893a5', // muted
          base04: '#797593', // subtle
          base05: '#575279', // text
          base08: '#b4637a', // love
          base09: '#ea9d34', // gold
          base0A: '#d7827e', // rose
          base0B: '#286983', // pine
          base0C: '#56949f', // foam
          base0D: '#907aa9', // iris
        };
      }
    }

    const root = document.documentElement;

    const mapping = {
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

    Object.entries(mapping).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Set color-scheme for native elements
    root.style.setProperty('color-scheme', theme);
  };

  // Initialize and React to changes
  createEffect(() => {
    const currentTheme = theme();
    const currentScheme = scheme();

    document.documentElement.setAttribute("data-theme", currentTheme);
    document.documentElement.setAttribute("data-scheme", currentScheme);

    applyScheme(currentScheme, currentTheme);
  });

  return (
    <ThemeContext.Provider value={{ theme, setTheme, scheme, setScheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext)!;
