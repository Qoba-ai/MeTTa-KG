export interface Base16Scheme {
    name: string
    author: string
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

export const schemes: Record<string, Base16Scheme> = {
    'rose-pine': {
        name: 'Rosé Pine',
        author: 'Prophet (https://github.com/rose-pine/rose-pine)',
        base00: '#191724',
        base01: '#252136', // surface: bumped from #1f1d2e (~3% diff) to ~5.5% lightness above base
        base02: '#2d2b40',
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
    'nord': {
        name: 'Nord',
        author: 'arcticicestudio',
        base00: '#2e3440',
        base01: '#3b4252',
        base02: '#434c5e',
        base03: '#4c566a',
        base04: '#d8dee9',
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
    'dracula': {
        name: 'Dracula',
        author: 'Mikhail Savytskyi (https://github.com/Zonne Savytskyi), puler (https://github.com/puler)',
        base00: '#282a36',
        base01: '#363944',
        base02: '#44475a',
        base03: '#6272a4',
        base04: '#b45bcf',
        base05: '#f8f8f2',
        base06: '#ffffff',
        base07: '#ffffff',
        base08: '#ff5555',
        base09: '#ffb86c',
        base0A: '#f1fa8c',
        base0B: '#50fa7b',
        base0C: '#8be9fd',
        base0D: '#bd93f9',
        base0E: '#ff79c6',
        base0F: '#bd93f9',
    },
    'solarized-dark': {
        name: 'Solarized Dark',
        author: 'Ethan Schoonover (modified by aramisgithub)',
        base00: '#002b36',
        base01: '#0c3d4a', // surface: bumped from #073642 (~3.7% diff) to ~7% lightness above base
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
    'github': {
        name: 'GitHub',
        author: 'Defman21',
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
    }
}
