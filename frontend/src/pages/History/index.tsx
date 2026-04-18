import { Component, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import { Navbar } from '../../components/Navbar/Navbar'
import { NamespaceSelector } from '../Editor/components/NamespaceSelector/NamespaceSelector'
import { OpLogEntry } from '../../types'
import { BACKEND_URL } from '../../urls'
import styles from './History.module.scss'

// ─── Constants ────────────────────────────────────────────────────────────────

// x-centre of each operation-type swimlane (px)
const LANE_X: Record<string, number> = {
    Import:    150,
    Transform: 360,
    Clear:     560,
}
const FALLBACK_X     =  750
const NODE_GAP       =   14    // vertical gap between nodes in a lane
const ROW_OFFSET     =   80    // y of the top edge of the first node
const NODE_WIDTH_SM  =  148    // Import, Clear
const NODE_WIDTH_LG  =  178    // Transform (wider for input/output lines)
// SVG node layout constants
const SVG_HEADER_H   =   22    // op-type chip height
const SVG_LINE_H     =   14    // height per path line
const SVG_FOOTER_H   =   18    // space reserved for timestamp

// ─── Types ───────────────────────────────────────────────────────────────────

interface TransformSpace {
    path:      string
    pattern?:  string
    template?: string
}

interface GraphEdge {
    source: number
    target: number
}

interface GraphData {
    entries: OpLogEntry[]
    edges:   GraphEdge[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read a CSS custom property from :root at call time. */
const cssVar = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const OP_COLORS: Record<string, { bg: string; border: string }> = {
    Import:    { bg: '--foam',   border: '--foam' },
    Transform: { bg: '--iris',   border: '--iris' },
    Clear:     { bg: '--love',   border: '--love' },
}
const DEFAULT_COLOR = { bg: '--subtle', border: '--muted' }

/** Normalise a path for display: always /foo/bar/ with leading and trailing slash. */
const displayPath = (p: string) => {
    if (!p) return '/'
    const trimmed = p.replace(/\/+$/, '')
    return (trimmed.startsWith('/') ? trimmed : '/' + trimmed) + '/'
}

/** Truncate a path, keeping the tail (most distinctive part). */
const trunc = (s: string, max = 24) =>
    s.length > max ? '…' + s.slice(-(max - 1)) : s

/** Paths that an operation WRITES to (used to determine rollback dependencies). */
function getWriteSpaces(entry: OpLogEntry): string[] {
    if (entry.import) return [entry.import.path]
    if (entry.clear)  return [entry.clear.path]
    if (entry.transform) {
        const outs = entry.transform.output_spaces as TransformSpace[]
        return outs.map(s => s.path)
    }
    return []
}

/** True when `child` is `parent` or a subspace of it (e.g. "a/b" ⊆ "a").
 *  Trailing slashes are stripped before comparison so paths stored with or
 *  without a trailing slash compare correctly. */
function isSubspace(child: string, parent: string): boolean {
    const c = child.replace(/\/$/, '')
    const p = parent.replace(/\/$/, '')
    if (p === '') return true  // root contains everything
    return c === p || c.startsWith(p + '/')
}

/** Build a forward adjacency map from server-provided edges. */
function adjFromEdges(entries: OpLogEntry[], edges: GraphEdge[]): Map<number, number[]> {
    const adj = new Map<number, number[]>(entries.map(e => [e.id, []]))
    for (const edge of edges) adj.get(edge.source)?.push(edge.target)
    return adj
}

/** BFS from root through adj; returns all reachable ids including root. */
function reachableFrom(adj: Map<number, number[]>, root: number): Set<number> {
    const visited = new Set<number>()
    if (!adj.has(root)) return visited
    visited.add(root)
    const queue = [root]
    while (queue.length > 0) {
        const node = queue.shift()!
        for (const nbr of (adj.get(node) ?? [])) {
            if (!visited.has(nbr)) { visited.add(nbr); queue.push(nbr) }
        }
    }
    return visited
}

/** IDs that would be rolled back if Undo is applied to `entry`:
 *  the entry itself + all forward-reachable dependents. */
function getUndoPreviewIds(entry: OpLogEntry, entries: OpLogEntry[], edges: GraphEdge[]): Set<number> {
    return reachableFrom(adjFromEdges(entries, edges), entry.id)
}

/** IDs that would be re-applied if Redo is applied to `entry`:
 *  the entry itself + all rolled-back ancestors (reverse-reachable through
 *  the dependency graph, restricted to rolled-back entries). */
function getRedoPreviewIds(entry: OpLogEntry, entries: OpLogEntry[], edges: GraphEdge[]): Set<number> {
    const adj    = adjFromEdges(entries, edges)
    const revAdj = new Map<number, number[]>(entries.map(e => [e.id, []]))
    adj.forEach((deps, id) => {
        for (const dep of deps) revAdj.get(dep)?.push(id)
    })
    const rolledBackIds = new Set(entries.filter(e => e.rolled_back_at).map(e => e.id))
    const visited = new Set<number>()
    if (!rolledBackIds.has(entry.id)) return visited
    visited.add(entry.id)
    const queue = [entry.id]
    while (queue.length > 0) {
        const node = queue.shift()!
        for (const nbr of (revAdj.get(node) ?? [])) {
            if (!visited.has(nbr) && rolledBackIds.has(nbr)) {
                visited.add(nbr)
                queue.push(nbr)
            }
        }
    }
    return visited
}

/** Format an ISO timestamp as "Mon DD, HH:MM". */
function fmtDate(iso: string): string {
    const d = new Date(iso)
    const mon = d.toLocaleString('en-US', { month: 'short' })
    const hh  = d.getHours().toString().padStart(2, '0')
    const mm  = d.getMinutes().toString().padStart(2, '0')
    return `${mon} ${d.getDate()}, ${hh}:${mm}`
}

/** Escape XML special characters for safe embedding in SVG. */
function escXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Build an SVG data URI representing the node.
 * Returns the URI and the exact pixel dimensions so Cytoscape sizes the node correctly.
 */
function buildNodeSvg(entry: OpLogEntry): { uri: string; width: number; height: number } {
    const colorKeys = OP_COLORS[entry.op_type] ?? DEFAULT_COLOR
    const accent = cssVar(colorKeys.border)   // vivid colour (foam / iris / love)
    const fill   = cssVar(colorKeys.bg)       // same hue, used for tinted bg
    const text   = cssVar('--text')
    const muted  = cssVar('--muted')
    const surface = cssVar('--surface')

    const W = entry.op_type === 'Transform' ? NODE_WIDTH_LG : NODE_WIDTH_SM

    // Collect path lines (op type goes in the header chip, not here)
    const pathLines: string[] = []
    if (entry.import) {
        pathLines.push('→ ' + trunc(displayPath(entry.import.path), 16))
    } else if (entry.clear) {
        pathLines.push(trunc(displayPath(entry.clear.path), 16))
    } else if (entry.transform) {
        const ins  = entry.transform.input_spaces  as TransformSpace[]
        const outs = entry.transform.output_spaces as TransformSpace[]
        for (const s of ins)  pathLines.push('← ' + trunc(displayPath(s.path), 18))
        for (const s of outs) pathLines.push('→ ' + trunc(displayPath(s.path), 18))
    }

    const H = SVG_HEADER_H + 6 + Math.max(1, pathLines.length) * SVG_LINE_H + SVG_FOOTER_H

    const rolledBack = !!entry.rolled_back_at
    const dash = rolledBack ? 'stroke-dasharray="4 3"' : ''

    // Path lines SVG fragments
    const pathSvg = pathLines.map((line, i) => {
        const y = SVG_HEADER_H + 6 + i * SVG_LINE_H + SVG_LINE_H * 0.78
        return `<text x="${W / 2}" y="${y}" text-anchor="middle" `
            + `font-family="'Fira Code',Consolas,monospace" font-size="10" `
            + `fill="${escXml(text)}">${escXml(line)}</text>`
    }).join('')

    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,

        // Body background
        `<rect width="${W}" height="${H}" rx="6" `
            + `fill="${escXml(surface)}" fill-opacity="0.6" `
            + `stroke="${escXml(accent)}" stroke-width="1.5" stroke-opacity="0.7" ${dash}/>`,

        // Header band — rounded top, flat bottom
        `<rect x="0" y="0" width="${W}" height="${SVG_HEADER_H}" rx="6" `
            + `fill="${escXml(fill)}" fill-opacity="0.45"/>`,
        // square off the bottom corners of the header
        `<rect x="0" y="${SVG_HEADER_H - 6}" width="${W}" height="6" `
            + `fill="${escXml(fill)}" fill-opacity="0.45"/>`,

        // Op-type label inside the chip
        `<text x="${W / 2}" y="${SVG_HEADER_H * 0.72}" text-anchor="middle" `
            + `font-family="system-ui,sans-serif" font-size="9" font-weight="700" letter-spacing="1.5" `
            + `fill="${escXml(accent)}" fill-opacity="0.95">${escXml(entry.op_type.toUpperCase())}</text>`,

        // Subtle divider below chip
        `<line x1="0" y1="${SVG_HEADER_H}" x2="${W}" y2="${SVG_HEADER_H}" `
            + `stroke="${escXml(accent)}" stroke-opacity="0.2" stroke-width="0.5"/>`,

        // Path lines
        pathSvg,

        // Timestamp — bottom, muted
        `<text x="${W / 2}" y="${H - 5}" text-anchor="middle" `
            + `font-family="system-ui,sans-serif" font-size="8.5" `
            + `fill="${escXml(muted)}" fill-opacity="0.75">${escXml(fmtDate(entry.created_at))}</text>`,

        `</svg>`,
    ].join('')

    return {
        uri:    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        width:  W,
        height: H,
    }
}

function buildNodes(entries: OpLogEntry[]): ElementDefinition[] {
    // oldest first so they appear at the top of each lane
    const sorted = [...entries].sort((a, b) => a.id - b.id)
    // track the y of the next node's TOP edge per lane
    const laneNextTop: Record<string, number> = {}

    return sorted.map((entry) => {
        const { uri, width, height } = buildNodeSvg(entry)

        const topY    = laneNextTop[entry.op_type] ?? ROW_OFFSET
        laneNextTop[entry.op_type] = topY + height + NODE_GAP
        const centerY = topY + height / 2

        return {
            data: {
                id:         String(entry.id),
                svgUri:     uri,
                rolledBack: entry.rolled_back_at ? 1 : 0,
                nodeHeight: height,
                nodeWidth:  width,
            },
            position: {
                x: LANE_X[entry.op_type] ?? FALLBACK_X,
                y: centerY,
            },
        }
    })
}

/** Convert server-provided edges to Cytoscape edge definitions. */
function edgesToCyto(edges: GraphEdge[]): ElementDefinition[] {
    return edges.map(e => ({
        data: {
            id:     `e-${e.source}-${e.target}`,
            source: String(e.source),
            target: String(e.target),
        },
    }))
}

function buildElements(entries: OpLogEntry[], edges: GraphEdge[]): ElementDefinition[] {
    return [...buildNodes(entries), ...edgesToCyto(edges)]
}

// cytoscape's TS types for style values are very strict; cast to any to avoid
// fighting the library's type definitions while keeping the code readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStylesheet(): any[] {
    return [
        {
            // SVG data URI provides the full visual; Cytoscape handles geometry & events only.
            selector: 'node',
            style: {
                'background-image':    'data(svgUri)',
                'background-fit':      'cover',
                'background-opacity':  0,          // hide Cytoscape's own fill; SVG provides it
                'border-width':        0,           // SVG draws its own border
                'label':               '',
                'width':               'data(nodeWidth)',
                'height':              'data(nodeHeight)',
                'shape':               'rectangle', // SVG handles rounded corners
                'transition-property': 'opacity',
                'transition-duration': '150ms',
            },
        },
        {
            // rolled-back: dim the whole element; SVG also shows a dashed border
            selector: 'node[rolledBack = 1]',
            style: { 'opacity': 0.45 },
        },
        {
            selector: 'node:selected',
            style: {
                'outline-width':   3,
                'outline-color':   cssVar('--iris'),
                'outline-offset':  3,
                'outline-opacity': 1,
            },
        },
        {
            selector: 'node:active',
            style: { 'overlay-opacity': 0.07 },
        },
        {
            selector: 'edge',
            style: {
                'curve-style':        'bezier',
                'target-arrow-shape': 'triangle',
                'arrow-scale':        0.8,
                'line-color':         cssVar('--muted'),
                'target-arrow-color': cssVar('--muted'),
                'opacity':            0.50,
                'width':              1.5,
            },
        },
        {
            selector: 'node[rolledBack = 1] ~ edge, edge[?rolledBack]',
            style: { 'opacity': 0.15 },
        },
        {
            // preview: highlight nodes in the undo/redo affected set
            selector: 'node.preview-hi',
            style: {
                'outline-width':   3,
                'outline-color':   cssVar('--gold'),
                'outline-offset':  3,
                'outline-opacity': 1,
            },
        },
        {
            selector: 'node.preview-lo',
            style: { 'opacity': 0.15 },
        },
        {
            // namespace filter: highlight matching nodes
            selector: 'node.ns-hi',
            style: {
                'outline-width':   3,
                'outline-color':   cssVar('--foam'),
                'outline-offset':  3,
                'outline-opacity': 1,
            },
        },
        {
            // namespace filter: dim non-matching nodes
            selector: 'node.ns-lo',
            style: { 'opacity': 0.2 },
        },
    ]
}

// ─── Component ───────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
    { label: 'Import',    color: '--foam' },
    { label: 'Transform', color: '--iris' },
    { label: 'Clear',     color: '--love' },
] as const

const History: Component = () => {
    let containerRef: HTMLDivElement | undefined
    let cy: Core | undefined

    const [logs, setLogs]               = createSignal<OpLogEntry[]>([])
    const [graphEdges, setGraphEdges]   = createSignal<GraphEdge[]>([])
    const [loading, setLoading]         = createSignal(true)
    const [error, setError]             = createSignal<string | null>(null)
    const [selectedEntry, setSelectedEntry] = createSignal<OpLogEntry | null>(null)
    const [actionBusy, setActionBusy]   = createSignal(false)
    const [layoutMode, setLayoutMode]   = createSignal<'timeline' | 'dependency' | 'compact'>('timeline')
    const [filterNs,   setFilterNs]     = createSignal('')

    const applyPreview = (ids: Set<number>) => {
        if (!cy) return
        cy.nodes().forEach(node => {
            const id = parseInt(node.id(), 10)
            if (ids.has(id)) {
                node.removeClass('preview-lo'); node.addClass('preview-hi')
            } else {
                node.removeClass('preview-hi'); node.addClass('preview-lo')
            }
        })
    }
    const clearPreview = () => cy?.nodes().removeClass('preview-hi preview-lo')

    const tokenCode = localStorage.getItem('rootToken')

    // ── Namespace autocomplete ───────────────────────────────────────────────────

    let nsTree: any = null
    let nsTreePromise: Promise<void> | null = null

    const ensureNsTree = async () => {
        if (nsTree) return
        if (!nsTreePromise) {
            nsTreePromise = (async () => {
                try {
                    const res = await fetch(`${BACKEND_URL}/namespaces/`, {
                        headers: { Authorization: tokenCode! },
                    })
                    if (res.ok) nsTree = await res.json()
                } catch { /* ignore */ } finally {
                    if (!nsTree) nsTreePromise = null
                }
            })()
        }
        return nsTreePromise
    }

    const fetchExploreResults = async (path: string): Promise<any[]> => {
        if (!tokenCode) return []
        await ensureNsTree()
        if (!nsTree) return []

        let ns = path
        if (ns.startsWith('/')) ns = ns.substring(1)
        if (ns.endsWith('/'))   ns = ns.slice(0, -1)
        const parts = ns.split('/').filter(p => p.length > 0)

        let node: any = nsTree
        for (const part of parts) {
            const subs: any[] = node?.subnamespaces || []
            node = subs.find((s: any) => {
                const subNs: string = (s.namespace || '').toString().replace(/\\/g, '/')
                return subNs.split('/').filter((x: string) => x.length > 0).pop() === part
            }) ?? null
            if (!node) break
        }

        const results: any[] = []
        const seen = new Set<string>()
        for (const sub of node?.subnamespaces || []) {
            const namespace: string = (sub.namespace || '').toString().replace(/\\/g, '/')
            const resultPath = '/' + namespace + '/'
            if (!seen.has(resultPath)) {
                seen.add(resultPath)
                results.push({ path: resultPath, expr: '' })
            }
        }
        return results
    }

    const fetchGraph = async (): Promise<GraphData> => {
        const res = await fetch(`${BACKEND_URL}/logs/graph`, {
            headers: { Authorization: tokenCode! },
        })
        if (!res.ok) throw new Error('Failed to load operation history.')
        return res.json()
    }

    onMount(async () => {
        if (!tokenCode) {
            setError('No token — log in from the Editor page first.')
            setLoading(false)
            return
        }
        try {
            const { entries, edges } = await fetchGraph()
            setLogs(entries)
            setGraphEdges(edges)
            initGraph(entries, edges)
        } catch (e: any) {
            setError(e.message ?? 'Could not connect to the server.')
        } finally {
            setLoading(false)
        }
    })

    onCleanup(() => cy?.destroy())

    function initGraph(entries: OpLogEntry[], edges: GraphEdge[]) {
        if (!containerRef) return
        cy?.destroy()

        cy = cytoscape({
            container:            containerRef,
            elements:             buildElements(entries, edges),
            layout:               { name: 'preset' },
            style:                buildStylesheet(),
            userZoomingEnabled:   true,
            userPanningEnabled:   true,
            boxSelectionEnabled:  false,
            minZoom:              0.2,
            maxZoom:              3,
        })

        cy.on('tap', 'node', (evt) => {
            const id = parseInt(evt.target.id(), 10)
            setSelectedEntry(entries.find(e => e.id === id) ?? null)
        })
        cy.on('tap', (evt) => {
            if (evt.target === cy) setSelectedEntry(null)
        })

        // Apply the current mode instantly (no animation on first render)
        applyMode(layoutMode(), 0)
    }

    // ── Layout internals ────────────────────────────────────────────────────────

    /** Shared position-setter: animate if dur > 0, else snap. */
    const setPos = (id: string, pos: { x: number; y: number }, dur: number) => {
        const node = cy!.getElementById(id)
        if (dur > 0) node.animate({ position: pos, duration: dur, easing: 'ease-in-out-quad' } as any)
        else         node.position(pos)
    }

    /** True if the entry writes to the given namespace or any subspace of it. */
    const normPath = (p: string) => '/' + p.replace(/^\/+/, '').replace(/\/+$/, '')

    const matchesNs = (entry: OpLogEntry, ns: string): boolean => {
        const normNs = normPath(ns)
        return getWriteSpaces(entry).some(p => isSubspace(normPath(p), normNs))
    }

    /** Apply/clear the namespace highlight without touching positions. */
    const applyNsHighlight = () => {
        if (!cy) return
        const ns = filterNs()
        cy.nodes().forEach(node => {
            node.removeClass('ns-hi ns-lo')
            if (!ns) return
            const id    = parseInt(node.id(), 10)
            const entry = logs().find(e => e.id === id)
            if (entry && matchesNs(entry, ns)) node.addClass('ns-hi')
            else                               node.addClass('ns-lo')
        })
    }

    // Re-apply highlight whenever the filter changes
    createEffect(() => { filterNs(); applyNsHighlight() })

    /** Timeline: nodes left → right by id, children fanned vertically. */
    const applyTimeline = (dur = 350) => {
        if (!cy) return
        const sorted = [...logs()].sort((a, b) => a.id - b.id)
        const H_STEP = 210, Y_STEP = 110

        const yOf = new Map<string, number>()
        sorted.forEach(entry => {
            const id = String(entry.id)
            if (!yOf.has(id)) yOf.set(id, 0)
            const parentY = yOf.get(id)!
            let childIdx = 0
            cy!.getElementById(id).outgoers('node').toArray()
                .sort((a, b) => parseInt(a.id()) - parseInt(b.id()))
                .forEach(child => {
                    if (!yOf.has(child.id())) {
                        yOf.set(child.id(), parentY + childIdx * Y_STEP)
                        childIdx++
                    }
                })
        })
        sorted.forEach((entry, i) =>
            setPos(String(entry.id), { x: i * H_STEP, y: yOf.get(String(entry.id)) ?? 0 }, dur))
        setTimeout(() => cy?.fit(undefined, 60), dur + 30)
    }

    /** Dependency: force-directed cose layout emphasising the causal DAG. */
    const applyDependency = (dur = 500) => {
        if (!cy) return
        cy.layout({
            name:              'cose',
            animate:           dur > 0,
            animationDuration: dur,
            nodeRepulsion:     8000,
            idealEdgeLength:   180,
            edgeElasticity:    0.4,
            gravity:           0.3,
            numIter:           1000,
            padding:           60,
            randomize:         false,
        } as any).run()
        setTimeout(() => cy?.fit(undefined, 60), dur + 30)
    }

    /** Compact: dense vertical list sorted by time, edges hidden. */
    const applyCompact = (dur = 300) => {
        if (!cy) return
        const sorted = [...logs()].sort((a, b) => a.id - b.id)
        const GAP = 6
        let cumY = 0
        sorted.forEach(entry => {
            const id   = String(entry.id)
            const node = cy!.getElementById(id)
            const h    = (node.data('nodeHeight') as number) ?? 60
            setPos(id, { x: 0, y: cumY + h / 2 }, dur)
            cumY += h + GAP
        })
        cy.edges().style({ display: 'none' } as any)
        setTimeout(() => cy?.fit(undefined, 60), dur + 30)
    }

    /** Dispatch to the correct apply function (used by initGraph and switchMode). */
    const applyMode = (mode: ReturnType<typeof layoutMode>, dur?: number) => {
        if      (mode === 'timeline')   applyTimeline(dur)
        else if (mode === 'dependency') applyDependency(dur)
        else if (mode === 'compact')    applyCompact(dur)
    }

    /** Switch the active display mode. */
    const switchMode = (mode: ReturnType<typeof layoutMode>) => {
        if (mode === layoutMode()) return
        if (layoutMode() === 'compact') cy?.edges().removeStyle('display')
        setLayoutMode(mode)
        applyMode(mode)
    }

    const handleFit = () => cy?.fit(undefined, 60)

    const handleRefresh = async () => {
        if (!tokenCode) return
        setLoading(true)
        setSelectedEntry(null)
        try {
            const { entries, edges } = await fetchGraph()
            setLogs(entries)
            setGraphEdges(edges)
            initGraph(entries, edges)
        } catch { /* ignore */ } finally {
            setLoading(false)
        }
    }

    const handleUndo = async () => {
        const entry = selectedEntry()
        if (!entry || !tokenCode) return
        setActionBusy(true)
        try {
            await fetch(`${BACKEND_URL}/logs/${entry.id}/rollback`, {
                method: 'POST',
                headers: { Authorization: tokenCode },
            })
            const { entries, edges } = await fetchGraph()
            setLogs(entries)
            setGraphEdges(edges)
            setSelectedEntry(entries.find((e) => e.id === entry.id) ?? null)
            initGraph(entries, edges)
        } finally {
            setActionBusy(false)
        }
    }

    const handleRedo = async (force = false) => {
        const entry = selectedEntry()
        if (!entry || !tokenCode) return
        setActionBusy(true)
        try {
            const url = force
                ? `${BACKEND_URL}/logs/${entry.id}/redo?force=true`
                : `${BACKEND_URL}/logs/${entry.id}/redo`
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: tokenCode },
            })
            if (res.status === 409) {
                const body = await res.json()
                const opIds = (body.conflicting_ops || []).join(', ')
                setActionBusy(false)
                if (window.confirm(`Redo conflicts with newer operations (${opIds}). Redo anyway?`)) {
                    handleRedo(true)
                }
                return
            }
            const { entries, edges } = await fetchGraph()
            setLogs(entries)
            setGraphEdges(edges)
            setSelectedEntry(entries.find((e) => e.id === entry.id) ?? null)
            initGraph(entries, edges)
        } finally {
            setActionBusy(false)
        }
    }

    const handleCheckpoint = async () => {
        if (!tokenCode) return
        setActionBusy(true)
        try {
            const res = await fetch(`${BACKEND_URL}/logs/checkpoint`, {
                method: 'POST',
                headers: { Authorization: tokenCode },
            })
            if (res.ok) {
                const { entries, edges } = await fetchGraph()
                setLogs(entries)
                setGraphEdges(edges)
                setSelectedEntry(null)
                initGraph(entries, edges)
            }
        } finally {
            setActionBusy(false)
        }
    }

    return (
        <div class={styles.MainLayout}>
            <Navbar title="MeTTa KG — History" currentPage="history" />
            <main class={styles.Main}>
                <Show when={loading()}>
                    <div class={styles.Overlay}>
                        <span class={styles.LoadingText}>Loading history…</span>
                    </div>
                </Show>
                <Show when={error()}>
                    <div class={styles.Overlay}>
                        <span class={styles.ErrorText}>{error()}</span>
                    </div>
                </Show>
                <Show when={!loading() && !error() && logs().length === 0}>
                    <div class={styles.Overlay}>
                        <span class={styles.EmptyText}>No operations recorded yet.</span>
                    </div>
                </Show>

                {/* Graph canvas */}
                <div class={styles.GraphContainer} ref={containerRef} />

                {/* Mode selector */}
                <div class={styles.ModeBar}>
                    {(
                        [
                            ['timeline',   'Timeline',   'Left → right by timestamp, children fanned vertically'],
                            ['dependency', 'Dependency', 'Force-directed layout emphasising the causal graph'],
                            ['compact',    'Compact',    'Dense vertical list — edges hidden'],
                        ] as const
                    ).map(([mode, label, tip]) => (
                        <button
                            class={styles.ModeButton}
                            classList={{ [styles.ModeButtonActive]: layoutMode() === mode }}
                            onClick={() => switchMode(mode)}
                            title={tip}
                        >
                            {label}
                        </button>
                    ))}

                    {/* Namespace filter — only visible in timeline mode */}
                    <Show when={layoutMode() === 'timeline'}>
                        <div class={styles.NsFilterWrap}>
                            <div class={styles.NsFilterRow}>
                                <NamespaceSelector
                                    value={filterNs()}
                                    onInput={setFilterNs}
                                    placeholder="Filter by namespace…"
                                    fetchExploreResults={fetchExploreResults}
                                />
                                <Show when={filterNs()}>
                                    <button
                                        class={styles.NsClearBtn}
                                        onClick={() => setFilterNs('')}
                                        title="Clear filter"
                                    >×</button>
                                </Show>
                            </div>
                        </div>
                    </Show>
                </div>

                {/* Toolbar */}
                <div class={styles.Toolbar}>
                    <button class={styles.ToolbarButton} onClick={handleRefresh} title="Refresh">
                        ↺
                    </button>
                    <button class={styles.ToolbarButton} onClick={handleFit} title="Fit to view">
                        ⊞
                    </button>
                    <button
                        class={styles.ToolbarButton}
                        onClick={handleCheckpoint}
                        disabled={actionBusy()}
                        title="Seal older operations (makes them read-only, improves performance)"
                    >
                        Checkpoint
                    </button>
                </div>

                {/* Node action panel — shown when a node is selected */}
                <Show when={selectedEntry()}>
                    {(entry) => (
                        <div class={styles.ActionPanel}>
                            <span class={styles.ActionPanelTitle}>
                                #{entry().id} {entry().op_type}
                            </span>
                            <div class={styles.ActionPanelButtons}>
                                <button
                                    class={styles.ActionButton}
                                    disabled={!!entry().rolled_back_at || actionBusy()}
                                    onClick={handleUndo}
                                    onMouseEnter={() => applyPreview(getUndoPreviewIds(entry(), logs(), graphEdges()))}
                                    onMouseLeave={clearPreview}
                                    title="Undo this operation (hover to preview affected nodes)"
                                >
                                    Undo
                                </button>
                                <button
                                    class={styles.ActionButton}
                                    disabled={!entry().rolled_back_at || actionBusy()}
                                    onClick={() => handleRedo()}
                                    onMouseEnter={() => applyPreview(getRedoPreviewIds(entry(), logs(), graphEdges()))}
                                    onMouseLeave={clearPreview}
                                    title="Redo this operation (hover to preview affected nodes)"
                                >
                                    Redo
                                </button>

                            </div>
                        </div>
                    )}
                </Show>

                {/* Legend */}
                <Show when={!loading() && !error()}>
                    <div class={styles.Legend}>
                        {LEGEND_ITEMS.map(item => (
                            <div class={styles.LegendItem}>
                                <div
                                    class={styles.LegendDot}
                                    style={{ background: `var(${item.color})` }}
                                />
                                <span>{item.label}</span>
                            </div>
                        ))}
                        <div class={styles.LegendItem}>
                            <div class={`${styles.LegendDot} ${styles.LegendDotRolledBack}`} />
                            <span>Rolled back</span>
                        </div>
                    </div>
                </Show>
            </main>
        </div>
    )
}

export default History
