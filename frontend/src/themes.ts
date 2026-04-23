export interface Base16Colors {
    base00: string
    base01: string
    base02: string
    base03: string
    base04: string
    base05: string
    base06: string
    base07: string
    base08: string
    base09: string
    base0A: string
    base0B: string
    base0C: string
    base0D: string
    base0E: string
    base0F: string
}

export interface ThemeVariant {
    name: string
    isDark: boolean
    colors: Base16Colors
}

export interface Theme {
    name: string
    variants: Record<string, ThemeVariant>
}

export const themes: Record<string, Theme> = {
    'aura': {
        name: 'Aura',
        variants: {
            'light': {
                name: 'Aura Light',
                isDark: false,
                colors: {
                    base00: '#ffffff', // Pure canvas
                    base01: '#f8fafc', // Soft sidebar/background
                    base02: '#e2e8f0', // Borders and dividers
                    base03: '#94a3b8', // Deemphasized text
                    base04: '#64748b', // Secondary text
                    base05: '#334155', // Primary body text
                    base06: '#1e293b', // Headings/Strong
                    base07: '#0f172a', // Deepest ink
                    base08: '#e11d48', // Vibrant Rose (Red)
                    base09: '#f59e0b', // Amber (Orange/Yellow)
                    base0A: '#8b5cf6', // Violet
                    base0B: '#10b981', // Emerald (Green)
                    base0C: '#0ea5e9', // Sky Blue
                    base0D: '#3b82f6', // Bright Blue
                    base0E: '#d946ef', // Fuchsia
                    base0F: '#475569', // Slate accent
                },
            },
            'dark': {
                name: 'Aura Dark',
                isDark: true,
                colors: {
                    base00: '#0f172a', // Deep Navy/Slate background
                    base01: '#1e293b', // Sidebar/Card background
                    base02: '#334155', // Borders
                    base03: '#475569', // Muted text
                    base04: '#94a3b8', // Secondary text
                    base05: '#e2e8f0', // Primary text
                    base06: '#f8fafc', // Bright text
                    base07: '#ffffff', // Pure white highlights
                    base08: '#fb7185', // Soft Rose
                    base09: '#fbbf24', // Warm Amber
                    base0A: '#a78bfa', // Soft Violet
                    base0B: '#34d399', // Fresh Emerald
                    base0C: '#38bdf8', // Sky Blue
                    base0D: '#60a5fa', // Soft Blue
                    base0E: '#f472b6', // Pink/Fuchsia
                    base0F: '#94a3b8', // Slate accent
                },
            },
        },
    },
    'rose-pine': {
        name: 'Rosé Pine',
        variants: {
            'main': {
                name: 'Main',
                isDark: true,
                colors: {
                    base00: '#191724',
                    base01: '#1f1d2e',
                    base02: '#26233a',
                    base03: '#6e6a86',
                    base04: '#908caa',
                    base05: '#e0def4',
                    base06: '#e0def4',
                    base07: '#524f67',
                    base08: '#eb6f92',
                    base09: '#f6c177',
                    base0A: '#ebbcba',
                    base0B: '#31748f',
                    base0C: '#9ccfd8',
                    base0D: '#c4a7e7',
                    base0E: '#c4a7e7',
                    base0F: '#524f67',
                },
            },
            'moon': {
                name: 'Moon',
                isDark: true,
                colors: {
                    base00: '#232136',
                    base01: '#2a273f',
                    base02: '#393552',
                    base03: '#6e6a86',
                    base04: '#908caa',
                    base05: '#e0def4',
                    base06: '#e0def4',
                    base07: '#56526e',
                    base08: '#eb6f92',
                    base09: '#f6c177',
                    base0A: '#ea9a97',
                    base0B: '#3e8fb0',
                    base0C: '#9ccfd8',
                    base0D: '#c4a7e7',
                    base0E: '#c4a7e7',
                    base0F: '#56526e',
                },
            },
            'dawn': {
                name: 'Dawn',
                isDark: false,
                colors: {
                    base00: '#faf4ed',
                    base01: '#fffaf3',
                    base02: '#f2e9e1',
                    base03: '#9893a5',
                    base04: '#797593',
                    base05: '#575279',
                    base06: '#575279',
                    base07: '#cecacd',
                    base08: '#b4637a',
                    base09: '#ea9d34',
                    base0A: '#d7827e',
                    base0B: '#286983',
                    base0C: '#56949f',
                    base0D: '#907aa9',
                    base0E: '#907aa9',
                    base0F: '#cecacd',
                },
            },
        },
    },
    'nord': {
        name: 'Nord',
        variants: {
            'default': {
                name: 'Nord',
                isDark: true,
                colors: {
                    base00: '#2e3440',
                    base01: '#3b4252',
                    base02: '#434c5e',
                    base03: '#4c566a',
                    // adjusted from #d8dee9 — nearly identical to text (#e5e9f0),
                    // overridden to a mid-range blue-gray for legible contrast
                    base04: '#8fafc9',
                    base05: '#e5e9f0',
                    base06: '#eceff4',
                    base07: '#8fbcbb',
                    base08: '#bf616a',
                    base09: '#d08770',
                    base0A: '#ebcb8b',
                    base0B: '#a3be8c',
                    base0C: '#88c0d0',
                    base0D: '#81a1c1',
                    base0E: '#b48ead',
                    base0F: '#5e81ac',
                },
            },
        },
    },
    'solarized': {
        name: 'Solarized',
        variants: {
            'dark': {
                name: 'Dark',
                isDark: true,
                colors: {
                    base00: '#002b36',
                    base01: '#0c3d4a',
                    base02: '#586e75',
                    base03: '#657b83',
                    base04: '#839496',
                    base05: '#93a1a1',
                    base06: '#eee8d5',
                    base07: '#fdf6e3',
                    base08: '#dc322f',
                    base09: '#cb4b16',
                    base0A: '#b58900',
                    base0B: '#859900',
                    base0C: '#2aa198',
                    base0D: '#268bd2',
                    base0E: '#6c71c4',
                    base0F: '#d33682',
                },
            },
        },
    },
    'github': {
        name: 'GitHub',
        variants: {
            'light': {
                name: 'Light',
                isDark: false,
                colors: {
                    base00: '#ffffff',
                    base01: '#f5f5f5',
                    base02: '#c8c8c8',
                    base03: '#969696',
                    base04: '#646464',
                    base05: '#333333',
                    base06: '#202020',
                    base07: '#000000',
                    base08: '#ed6a43',
                    base09: '#0086b3',
                    base0A: '#795da3',
                    base0B: '#183691',
                    base0C: '#183691',
                    base0D: '#795da3',
                    base0E: '#a71d5d',
                    base0F: '#333333',
                },
            },
        },
    },
}
